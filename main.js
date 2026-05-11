const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
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

function normalizeAdSegmentThreshold(value) {
  const threshold = Number.parseInt(value, 10);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : 10;
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
    adSegmentThreshold: normalizeAdSegmentThreshold(parsed.adSegmentThreshold),
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

function notifyTaskLog(task, message) {
  notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message });
}

function escapeRegex(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function getSegmentFilename(url) {
  const text = String(url || "").trim();
  if (!text) {
    return "";
  }

  try {
    return path.basename(new URL(text).pathname);
  } catch (error) {
    return path.basename(text.split(/[?#]/)[0]);
  }
}

function extractSuspiciousAdFilenames(meta, adSegmentThreshold = 10) {
  const threshold = normalizeAdSegmentThreshold(adSegmentThreshold);
  const filenames = new Set();
  if (!Array.isArray(meta)) {
    return [];
  }

  for (const item of meta) {
    const mediaParts = item && item.Playlist && Array.isArray(item.Playlist.MediaParts)
      ? item.Playlist.MediaParts
      : [];

    for (const part of mediaParts) {
      const segments = part && Array.isArray(part.MediaSegments) ? part.MediaSegments : [];
      if (segments.length === 0 || segments.length >= threshold) {
        continue;
      }

      for (const segment of segments) {
        const filename = getSegmentFilename(segment && segment.Url);
        if (filename) {
          filenames.add(filename);
        }
      }
    }
  }

  return [...filenames];
}

async function findNewestFile(rootDir, targetName) {
  let newest = null;

  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (entry.name !== targetName) {
        continue;
      }

      const stats = await fs.promises.stat(entryPath);
      if (!newest || stats.mtimeMs > newest.mtimeMs) {
        newest = { path: entryPath, mtimeMs: stats.mtimeMs };
      }
    }
  }

  await walk(rootDir);
  return newest ? newest.path : "";
}

function buildDownloadArgs(input, tmpDir, saveDir, saveName, extraArgs = []) {
  return [
    input,
    "--tmp-dir",
    tmpDir,
    "--save-dir",
    saveDir,
    "--save-name",
    saveName,
    "--auto-select",
    ...extraArgs
  ];
}

function runDownloader(task, args) {
  notifyTaskUpdate({
    id: task.id,
    pageId: task.pageId,
    status: "log",
    message: `CMD: ${formatCommand(task.exePath, args)}\n`
  });

  return new Promise((resolve, reject) => {
    const child = spawn(task.exePath, args, {
      windowsHide: true
    });
    currentProcess = child;

    child.stdout.on("data", (data) => {
      notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message: decodeOutput(data) });
    });

    child.stderr.on("data", (data) => {
      notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message: decodeOutput(data) });
    });

    child.on("error", (error) => {
      currentProcess = null;
      reject(error);
    });

    child.on("close", (code) => {
      currentProcess = null;
      resolve(code);
    });
  });
}

async function prepareAdKeyword(task) {
  const parseTmpDir = path.join(path.dirname(task.tempShowDir), `${path.basename(task.tempShowDir)}.${task.saveName}.parse`);
  await fs.promises.rm(parseTmpDir, { recursive: true, force: true });
  ensureDir(parseTmpDir);

  const parseArgs = buildDownloadArgs(task.url, parseTmpDir, parseTmpDir, task.saveName, ["--skip-download"]);
  notifyTaskLog(task, `去广告解析：先跳过下载并生成 meta_selected.json，片段阈值 ${task.adSegmentThreshold}。\n`);
  const code = await runDownloader(task, parseArgs);
  if (task.cancelled) {
    return "";
  }
  if (code !== 0) {
    throw new Error(`Parse exited with code ${code}`);
  }

  const metaPath = await findNewestFile(parseTmpDir, "meta_selected.json");
  if (!metaPath) {
    throw new Error("meta_selected.json not found");
  }

  const metaText = await fs.promises.readFile(metaPath, "utf-8");
  const meta = JSON.parse(metaText.replace(/^\uFEFF/, ""));
  const filenames = extractSuspiciousAdFilenames(meta, task.adSegmentThreshold);
  await fs.promises.rm(parseTmpDir, { recursive: true, force: true });

  if (filenames.length === 0) {
    notifyTaskLog(task, "去广告解析完成：未发现可疑广告分片，将正常下载。\n");
    return "";
  }

  notifyTaskLog(task, `去广告解析完成：发现 ${filenames.length} 个可疑广告分片。\n`);
  return filenames.map(escapeRegex).join("|");
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

    const extraArgs = [];
    if (task.removeAds) {
      const adKeyword = await prepareAdKeyword(task);
      if (task.cancelled) {
        notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" });
        return;
      }
      if (adKeyword) {
        extraArgs.push("--ad-keyword", adKeyword);
      }
    }

    const args = buildDownloadArgs(task.url, task.tempShowDir, task.tempShowDir, task.saveName, extraArgs);
    const code = await runDownloader(task, args);
    if (code === 0) {
      try {
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
  } catch (error) {
    if (task.cancelled) {
      notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" });
    } else {
      notifyTaskUpdate({
        id: task.id,
        pageId: task.pageId,
        status: "error",
        message: `Task failed: ${error.message}`
      });
    }
  } finally {
    currentTask = null;
    running = false;
    runNext();
  }
}

ipcMain.handle("tasks:start", (event, payload) => {
  let { exePath, tempRoot, finalRoot, showName, pageId, removeAds, adSegmentThreshold, items } = payload;
  const normalizedShow = (showName || "").trim();
  const storedConfig = readConfig();
  exePath = exePath || storedConfig.exePath;
  tempRoot = tempRoot || storedConfig.tempRoot;
  finalRoot = finalRoot || storedConfig.finalRoot;
  pageId = pageId || storedConfig.activePageId;
  removeAds = removeAds !== false;
  adSegmentThreshold = normalizeAdSegmentThreshold(adSegmentThreshold || storedConfig.adSegmentThreshold);
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
      removeAds,
      adSegmentThreshold
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
