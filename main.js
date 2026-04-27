const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const { fileURLToPath, pathToFileURL } = require("url");
const iconv = require("iconv-lite");
const fs = require("fs");
const path = require("path");

let mainWindow;
let currentProcess = null;
let currentTask = null;
let queue = [];
let running = false;

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function createDefaultPage(parsed = {}) {
  return {
    id: "page-1",
    title: parsed.showName || "页面 1",
    showName: parsed.showName || "",
    finalRoot: parsed.finalRoot || "",
    batchInput: parsed.batchInput || ""
  };
}

function normalizePages(parsed = {}) {
  const pages = Array.isArray(parsed.pages) && parsed.pages.length > 0
    ? parsed.pages
    : [createDefaultPage(parsed)];

  return pages.map((page, index) => {
    const id = page.id || `page-${index + 1}`;
    const showName = page.showName || "";
    return {
      id,
      title: page.title || showName || `页面 ${index + 1}`,
      showName,
      finalRoot: page.finalRoot || "",
      batchInput: page.batchInput || ""
    };
  });
}

function createConfig(parsed = {}) {
  const defaultExe = path.join(app.getAppPath(), "bin", "N_m3u8DL-RE.exe");
  const fallbackExe = path.join(process.resourcesPath, "bin", "N_m3u8DL-RE.exe");
  const defaultTempRoot = path.join(app.getAppPath(), "tmp");
  const exeCandidate = parsed.exePath || "";
  const resolvedExe = fs.existsSync(exeCandidate)
    ? exeCandidate
    : fs.existsSync(defaultExe)
    ? defaultExe
    : fs.existsSync(fallbackExe)
    ? fallbackExe
    : "";
  const pages = normalizePages(parsed);
  const activePage = pages.find((page) => page.id === parsed.activePageId) || pages[0];

  return {
    exePath: resolvedExe,
    tempRoot: parsed.tempRoot || defaultTempRoot,
    removeAds: parsed.removeAds !== false,
    activePageId: activePage.id,
    pages,
    showName: activePage.showName,
    finalRoot: activePage.finalRoot,
    batchInput: activePage.batchInput
  };
}

function readConfig() {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return createConfig(JSON.parse(raw));
  } catch (error) {
    return createConfig();
  }
}

function writeConfig(nextConfig) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), "utf-8");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("config:get", () => {
  return readConfig();
});

ipcMain.handle("config:set", (event, nextConfig) => {
  writeConfig(nextConfig);
  return true;
});

ipcMain.handle("dialog:pick-exe", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Executable", extensions: ["exe"] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return "";
  }
  return result.filePaths[0];
});

ipcMain.handle("dialog:pick-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return "";
  }
  return result.filePaths[0];
});

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function moveEntry(sourcePath, targetPath) {
  try {
    await fs.promises.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }
  }

  const stats = await fs.promises.stat(sourcePath);
  if (stats.isDirectory()) {
    await fs.promises.cp(sourcePath, targetPath, { recursive: true });
    await fs.promises.rm(sourcePath, { recursive: true, force: true });
    return;
  }

  await fs.promises.copyFile(sourcePath, targetPath);
  await fs.promises.unlink(sourcePath);
}

async function moveDirectoryContents(sourceDir, targetDir) {
  ensureDir(targetDir);
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    await moveEntry(sourcePath, targetPath);
  }
}

function notifyTaskUpdate(payload) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("task:update", payload);
  }
}

function decodeOutput(buffer) {
  const utf8Text = buffer.toString("utf8");
  if (utf8Text.includes("�")) {
    try {
      return iconv.decode(buffer, "gbk");
    } catch (error) {
      return utf8Text;
    }
  }
  return utf8Text;
}

function quoteArg(value) {
  if (value == null) {
    return "";
  }
  const text = String(value);
  if (text.includes(" ") || text.includes("\t") || text.includes('"')) {
    return `"${text.replace(/"/g, "\\\"")}"`;
  }
  return text;
}

function formatCommand(exePath, args) {
  const parts = [exePath, ...args].map(quoteArg).filter(Boolean);
  return parts.join(" ");
}

function isHttpUrl(source) {
  try {
    const parsed = new URL(source);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function isFileUrl(source) {
  try {
    return new URL(source).protocol === "file:";
  } catch (error) {
    return false;
  }
}

async function readPlaylistText(source) {
  if (isHttpUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  const filePath = isFileUrl(source) ? fileURLToPath(source) : source;
  return fs.promises.readFile(filePath, "utf-8");
}

function removeDiscontinuityAdBlocks(m3u8Text) {
  const hasTrailingNewline = /\r?\n$/.test(m3u8Text);
  const lines = m3u8Text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const nextLines = [];
  let removedBlocks = 0;
  let removedSegments = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== "#EXT-X-DISCONTINUITY") {
      nextLines.push(lines[i]);
      continue;
    }

    let end = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() === "#EXT-X-DISCONTINUITY") {
        end = j;
        break;
      }
    }

    if (end === -1) {
      nextLines.push(lines[i]);
      continue;
    }

    const blockLines = lines.slice(i + 1, end);
    const segmentCount = blockLines.filter((line) => line.trim().startsWith("#EXTINF")).length;
    if (segmentCount === 0) {
      nextLines.push(lines[i]);
      continue;
    }

    removedBlocks += 1;
    removedSegments += segmentCount;
    i = end;
  }

  return {
    text: `${nextLines.join("\n")}${hasTrailingNewline ? "\n" : ""}`,
    removedBlocks,
    removedSegments
  };
}

function resolvePlaylistReference(reference, source) {
  if (!reference || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(reference)) {
    return reference;
  }

  if (isHttpUrl(source) || isFileUrl(source)) {
    return new URL(reference, source).toString();
  }

  const absolutePath = path.resolve(path.dirname(source), reference);
  return pathToFileURL(absolutePath).toString();
}

function rewriteUriAttributes(line, source) {
  return line.replace(/URI="([^"]+)"/g, (match, uri) => {
    return `URI="${resolvePlaylistReference(uri, source)}"`;
  });
}

function rewritePlaylistUrisToAbsolute(m3u8Text, source) {
  const hasTrailingNewline = /\r?\n$/.test(m3u8Text);
  const lines = m3u8Text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return line;
    }
    if (trimmed.startsWith("#")) {
      return rewriteUriAttributes(line, source);
    }
    return resolvePlaylistReference(trimmed, source);
  });

  return `${rewritten.join("\n")}${hasTrailingNewline ? "\n" : ""}`;
}

function notifyTaskLog(task, message) {
  notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message });
}

async function prepareDownloadInput(task) {
  if (!task.removeAds) {
    return task.url;
  }

  const playlistText = await readPlaylistText(task.url);
  const hasMediaSegments = /^#EXTINF/m.test(playlistText);
  const isMasterPlaylist = /^#EXT-X-STREAM-INF/m.test(playlistText) && !hasMediaSegments;
  if (isMasterPlaylist) {
    notifyTaskLog(task, "去广告跳过：当前链接是主播放列表，将由下载器自动选择清晰度。\n");
    return task.url;
  }

  const sanitized = removeDiscontinuityAdBlocks(playlistText);
  const rewritten = rewritePlaylistUrisToAbsolute(sanitized.text, task.url);
  const outputPath = path.join(task.tempShowDir, `${task.saveName}.adfree.m3u8`);
  await fs.promises.writeFile(outputPath, rewritten, "utf-8");
  task.generatedPlaylistPath = outputPath;
  notifyTaskLog(
    task,
    `去广告完成：移除 ${sanitized.removedBlocks} 个区块，${sanitized.removedSegments} 个分片。\n`
  );
  return outputPath;
}

async function runNext() {
  if (running || queue.length === 0) {
    return;
  }
  running = true;

  const task = queue.shift();
  currentTask = task;
  notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "running" });

  try {
    ensureDir(task.tempShowDir);
    ensureDir(task.finalShowDir);
  } catch (error) {
    notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "error", message: error.message });
    currentTask = null;
    running = false;
    runNext();
    return;
  }

  let downloadInput;
  try {
    downloadInput = await prepareDownloadInput(task);
  } catch (error) {
    notifyTaskUpdate({
      id: task.id,
      pageId: task.pageId,
      status: "error",
      message: `Ad removal failed: ${error.message}`
    });
    currentTask = null;
    running = false;
    runNext();
    return;
  }

  const args = [
    downloadInput,
    "--tmp-dir",
    task.tempShowDir,
    "--save-dir",
    task.tempShowDir,
    "--save-name",
    task.saveName,
    "--auto-select"
  ];

  notifyTaskUpdate({
    id: task.id,
    pageId: task.pageId,
    status: "log",
    message: `CMD: ${formatCommand(task.exePath, args)}\n`
  });

  currentProcess = spawn(task.exePath, args, {
    windowsHide: true
  });

  currentProcess.stdout.on("data", (data) => {
    notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message: decodeOutput(data) });
  });

  currentProcess.stderr.on("data", (data) => {
    notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message: decodeOutput(data) });
  });

  currentProcess.on("close", async (code) => {
    currentProcess = null;
    currentTask = null;
    if (code === 0) {
      try {
        if (task.generatedPlaylistPath) {
          await fs.promises.rm(task.generatedPlaylistPath, { force: true });
        }
        await moveDirectoryContents(task.tempShowDir, task.finalShowDir);
        notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "done" });
      } catch (error) {
        notifyTaskUpdate({
          id: task.id,
          pageId: task.pageId,
          status: "error",
          message: `Move failed: ${error.message}`
        });
      }
    } else if (task.cancelled) {
      notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" });
    } else {
      notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "error", message: `Exit code ${code}` });
    }

    running = false;
    runNext();
  });
}

ipcMain.handle("tasks:start", (event, payload) => {
  let { exePath, tempRoot, finalRoot, showName, pageId, removeAds, items } = payload;
  const normalizedShow = (showName || "").trim();
  const storedConfig = readConfig();
  exePath = exePath || storedConfig.exePath;
  tempRoot = tempRoot || storedConfig.tempRoot;
  finalRoot = finalRoot || storedConfig.finalRoot;
  pageId = pageId || storedConfig.activePageId;
  removeAds = removeAds !== false;
  if (!exePath || !tempRoot || !finalRoot || !normalizedShow) {
    return { ok: false, message: "Missing required settings." };
  }
  if (!fs.existsSync(exePath)) {
    return { ok: false, message: "N_m3u8DL-RE.exe not found. Please set the path in Settings." };
  }

  const tasks = [];
  for (const item of items) {
    const episodeTitle = (item.episodeTitle || "").trim();
    const url = (item.url || "").trim();
    if (!episodeTitle || !url) {
      continue;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempShowDir = path.join(tempRoot, normalizedShow);
    const finalShowDir = path.join(finalRoot, normalizedShow);
    const safeEpisode = episodeTitle.replace(/[\\/:*?"<>|]/g, "_");
    const safeShow = normalizedShow.replace(/[\\/:*?"<>|]/g, "_");
    const saveName = `${safeShow}_${safeEpisode}`;

    tasks.push({
      id,
      pageId,
      exePath,
      url,
      tempShowDir,
      finalShowDir,
      saveName,
      removeAds
    });
  }

  if (tasks.length === 0) {
    return { ok: false, message: "No valid tasks." };
  }

  queue.push(...tasks);
  for (const task of tasks) {
    notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "queued", name: task.saveName });
  }
  runNext();

  return { ok: true, tasks };
});

ipcMain.handle("tasks:cancel", () => {
  if (currentProcess) {
    if (currentTask) {
      currentTask.cancelled = true;
    }
    currentProcess.kill();
    return true;
  }
  return false;
});

ipcMain.handle("tasks:stop-all", () => {
  for (const task of queue) {
    notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" });
  }
  queue = [];
  if (currentProcess) {
    if (currentTask) {
      currentTask.cancelled = true;
    }
    currentProcess.kill();
    return true;
  }
  return false;
});

ipcMain.handle("tasks:remove", (event, id) => {
  if (!id) {
    return { ok: false, message: "Missing task id." };
  }

  if (currentTask && currentTask.id === id) {
    currentTask.cancelled = true;
    if (currentProcess) {
      currentProcess.kill();
    }
    return { ok: true, removed: "running" };
  }

  const index = queue.findIndex((task) => task.id === id);
  if (index !== -1) {
    const [task] = queue.splice(index, 1);
    notifyTaskUpdate({ id, pageId: task.pageId, status: "cancelled" });
    return { ok: true, removed: "queued" };
  }

  return { ok: false, message: "Task not found." };
});
