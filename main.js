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
  return Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
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
    useSystemProxy: parsed.useSystemProxy === true,
    adSegmentThreshold: normalizeAdSegmentThreshold(parsed.adSegmentThreshold),
    adDurationSequence: parsed.adDurationSequence || "",
    adDebugUrl: parsed.adDebugUrl || "",
    adDebugThreshold: normalizeAdSegmentThreshold(parsed.adDebugThreshold || parsed.adSegmentThreshold),
    adDebugSearch: parsed.adDebugSearch || "",
    adDebugDurationSequence: parsed.adDebugDurationSequence || "",
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
  if (task.debugLog && mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("ad-debug:log", message);
    return;
  }
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

function getAllMediaSegments(meta) {
  const segments = [];
  if (!Array.isArray(meta)) {
    return segments;
  }

  for (const item of meta) {
    const mediaParts = item && item.Playlist && Array.isArray(item.Playlist.MediaParts)
      ? item.Playlist.MediaParts
      : [];
    for (const part of mediaParts) {
      if (part && Array.isArray(part.MediaSegments)) {
        segments.push(...part.MediaSegments);
      }
    }
  }
  return segments;
}

function parseDurationSequence(value) {
  return String(value || "")
    .split(/[\s,，]+/)
    .map((item) => Number.parseFloat(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function isSameDuration(left, right) {
  return Math.abs(Number(left) - right) < 0.001;
}

function addFilename(filenames, segment) {
  const filename = getSegmentFilename(segment && segment.Url);
  if (filename) {
    filenames.add(filename);
  }
}

function addDurationSequenceFilenames(filenames, meta, durationSequence) {
  const sequence = parseDurationSequence(durationSequence);
  if (sequence.length === 0) {
    return 0;
  }

  const segments = getAllMediaSegments(meta);
  let count = 0;
  for (let i = 0; i <= segments.length - sequence.length; i += 1) {
    let matched = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (!isSameDuration(segments[i + j] && segments[i + j].Duration, sequence[j])) {
        matched = false;
        break;
      }
    }
    if (!matched) {
      continue;
    }

    for (let j = 0; j < sequence.length; j += 1) {
      addFilename(filenames, segments[i + j]);
    }
    count += 1;
  }
  return count;
}

function extractSuspiciousAdFilenames(meta, adSegmentThreshold = 5, durationSequence = "", useSegmentThreshold = true) {
  const threshold = normalizeAdSegmentThreshold(adSegmentThreshold);
  const filenames = new Set();
  if (!Array.isArray(meta)) {
    return { filenames: [], durationMatchCount: 0 };
  }

  for (const item of meta) {
    const mediaParts = item && item.Playlist && Array.isArray(item.Playlist.MediaParts)
      ? item.Playlist.MediaParts
      : [];

    for (const part of mediaParts) {
      const segments = part && Array.isArray(part.MediaSegments) ? part.MediaSegments : [];
      if (!useSegmentThreshold || segments.length === 0 || segments.length >= threshold) {
        continue;
      }

      for (const segment of segments) {
        addFilename(filenames, segment);
      }
    }
  }

  const durationMatchCount = addDurationSequenceFilenames(filenames, meta, durationSequence);
  return { filenames: [...filenames], durationMatchCount };
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

function runFfmpegFirstFrame(url, outputPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-ss", "0.1", "-i", url, "-frames:v", "1", "-f", "image2", outputPath];
    const child = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (data) => {
      stderr += decodeOutput(data);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function parseMetaSelected(task, parseTmpDir) {
  await fs.promises.rm(parseTmpDir, { recursive: true, force: true });
  ensureDir(parseTmpDir);

  const extraArgs = ["--skip-download", "--use-system-proxy", task.useSystemProxy ? "true" : "false"];
  const parseArgs = buildDownloadArgs(task.url, parseTmpDir, parseTmpDir, task.saveName, extraArgs);
  const code = await runDownloader(task, parseArgs);
  if (task.cancelled) {
    return null;
  }
  if (code !== 0) {
    throw new Error(`Parse exited with code ${code}`);
  }

  const metaPath = await findNewestFile(parseTmpDir, "meta_selected.json");
  if (!metaPath) {
    throw new Error("meta_selected.json not found");
  }

  const metaText = await fs.promises.readFile(metaPath, "utf-8");
  return {
    metaText: metaText.replace(/^\uFEFF/, ""),
    metaPath
  };
}

async function prepareAdKeyword(task) {
  const parseTmpDir = path.join(path.dirname(task.tempShowDir), `${path.basename(task.tempShowDir)}.${task.saveName}.parse`);
  notifyTaskLog(task, `去广告解析：先跳过下载并生成 meta_selected.json，片段阈值 ${task.adSegmentThreshold}。\n`);
  const parsed = await parseMetaSelected(task, parseTmpDir);
  if (!parsed) {
    return "";
  }

  const meta = JSON.parse(parsed.metaText);
  const { filenames, durationMatchCount } = extractSuspiciousAdFilenames(meta, task.adSegmentThreshold, task.adDurationSequence, task.removeAds);
  await fs.promises.rm(parseTmpDir, { recursive: true, force: true });

  if (durationMatchCount > 0) {
    notifyTaskLog(task, `去广告解析：duration 序列匹配 ${durationMatchCount} 次，已加入对应分片。\n`);
  }

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

    const extraArgs = ["--use-system-proxy", task.useSystemProxy ? "true" : "false"];

    if (task.removeAds || parseDurationSequence(task.adDurationSequence).length > 0) {
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

ipcMain.handle("ad-debug:first-frame", async (event, payload) => {
  const storedConfig = readConfig();
  const tempRoot = (payload && payload.tempRoot) || storedConfig.tempRoot;
  const url = (payload && payload.url || "").trim();
  if (!tempRoot || !url) {
    return { ok: false, message: "缺少临时目录或片段 URL。" };
  }

  const frameTmpDir = path.join(tempRoot, `ad-debug-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const framePath = path.join(frameTmpDir, "first-frame.png");
  try {
    ensureDir(frameTmpDir);
    await runFfmpegFirstFrame(url, framePath);
    const image = await fs.promises.readFile(framePath);
    return { ok: true, imageUrl: `data:image/png;base64,${image.toString("base64")}` };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    await fs.promises.rm(frameTmpDir, { recursive: true, force: true });
  }
});

ipcMain.handle("ad-debug:meta", async (event, payload) => {
  const storedConfig = readConfig();
  const exePath = (payload && payload.exePath) || storedConfig.exePath;
  const tempRoot = (payload && payload.tempRoot) || storedConfig.tempRoot;
  const useSystemProxy = payload && "useSystemProxy" in payload ? payload.useSystemProxy === true : storedConfig.useSystemProxy === true;
  const url = (payload && payload.url || "").trim();
  if (!exePath || !tempRoot || !url) {
    return { ok: false, message: "请先填写 m3u8 地址，并配置程序路径和临时目录。" };
  }
  if (!fs.existsSync(exePath)) {
    return { ok: false, message: "N_m3u8DL-RE.exe not found. Please set the path in Settings." };
  }

  const parseTmpDir = path.join(tempRoot, `ad-debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const task = {
    id: "ad-debug",
    pageId: "ad-debug",
    exePath,
    url,
    useSystemProxy,
    saveName: "ad-debug",
    debugLog: true
  };

  try {
    const parsed = await parseMetaSelected(task, parseTmpDir);
    if (!parsed) {
      return { ok: false, message: "解析已取消。" };
    }
    return { ok: true, metaText: parsed.metaText, metaPath: parsed.metaPath };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    await fs.promises.rm(parseTmpDir, { recursive: true, force: true });
  }
});


ipcMain.handle("tasks:start", (event, payload) => {
  let { exePath, tempRoot, finalRoot, showName, pageId, removeAds, useSystemProxy, adSegmentThreshold, adDurationSequence, items } = payload;
  const normalizedShow = (showName || "").trim();
  const storedConfig = readConfig();
  exePath = exePath || storedConfig.exePath;
  tempRoot = tempRoot || storedConfig.tempRoot;
  finalRoot = finalRoot || storedConfig.finalRoot;
  pageId = pageId || storedConfig.activePageId;
  removeAds = removeAds !== false;
  useSystemProxy = useSystemProxy === true;
  adSegmentThreshold = normalizeAdSegmentThreshold(adSegmentThreshold || storedConfig.adSegmentThreshold);
  adDurationSequence = adDurationSequence || storedConfig.adDurationSequence || "";
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
      useSystemProxy,
      adSegmentThreshold,
      adDurationSequence
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
