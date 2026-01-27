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

function readConfig() {
  const configPath = getConfigPath();
  const defaultExe = path.join(app.getAppPath(), "bin", "N_m3u8DL-RE.exe");
  const defaultTempRoot = path.join(app.getAppPath(), "tmp");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      exePath: parsed.exePath || defaultExe,
      tempRoot: parsed.tempRoot || defaultTempRoot,
      finalRoot: parsed.finalRoot || "",
      showName: parsed.showName || "",
      batchInput: parsed.batchInput || ""
    };
  } catch (error) {
    return {
      exePath: defaultExe,
      tempRoot: defaultTempRoot,
      finalRoot: "",
      showName: "",
      batchInput: ""
    };
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
  if (utf8Text.includes("\uFFFD")) {
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

async function runNext() {
  if (running || queue.length === 0) {
    return;
  }
  running = true;

  const task = queue.shift();
  currentTask = task;
  notifyTaskUpdate({ id: task.id, status: "running" });

  try {
    ensureDir(task.tempShowDir);
    ensureDir(task.finalShowDir);
  } catch (error) {
    notifyTaskUpdate({ id: task.id, status: "error", message: error.message });
    running = false;
    runNext();
    return;
  }

  const args = [
    task.url,
    "--save-dir",
    task.tempShowDir,
    "--save-name",
    task.saveName,
    "--auto-select"
  ];

  notifyTaskUpdate({
    id: task.id,
    status: "log",
    message: `CMD: ${formatCommand(task.exePath, args)}\n`
  });

  currentProcess = spawn(task.exePath, args, {
    windowsHide: true
  });

  currentProcess.stdout.on("data", (data) => {
    notifyTaskUpdate({ id: task.id, status: "log", message: decodeOutput(data) });
  });

  currentProcess.stderr.on("data", (data) => {
    notifyTaskUpdate({ id: task.id, status: "log", message: decodeOutput(data) });
  });

  currentProcess.on("close", async (code) => {
    currentProcess = null;
    currentTask = null;
    if (code === 0) {
      try {
        await moveDirectoryContents(task.tempShowDir, task.finalShowDir);
        notifyTaskUpdate({ id: task.id, status: "done" });
      } catch (error) {
        notifyTaskUpdate({
          id: task.id,
          status: "error",
          message: `Move failed: ${error.message}`
        });
      }
    } else if (task.cancelled) {
      notifyTaskUpdate({ id: task.id, status: "cancelled" });
    } else {
      notifyTaskUpdate({ id: task.id, status: "error", message: `Exit code ${code}` });
    }

    running = false;
    runNext();
  });
}

ipcMain.handle("tasks:start", (event, payload) => {
  let { exePath, tempRoot, finalRoot, showName, items } = payload;
  const normalizedShow = (showName || "").trim();
  const storedConfig = readConfig();
  exePath = exePath || storedConfig.exePath;
  tempRoot = tempRoot || storedConfig.tempRoot;
  finalRoot = finalRoot || storedConfig.finalRoot;
  if (!exePath || !tempRoot || !finalRoot || !normalizedShow) {
    return { ok: false, message: "Missing required settings." };
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
      exePath,
      url,
      tempShowDir,
      finalShowDir,
      saveName
    });
  }

  if (tasks.length === 0) {
    return { ok: false, message: "No valid tasks." };
  }

  queue.push(...tasks);
  for (const task of tasks) {
    notifyTaskUpdate({ id: task.id, status: "queued", name: task.saveName });
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
    notifyTaskUpdate({ id: task.id, status: "cancelled" });
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
    queue.splice(index, 1);
    notifyTaskUpdate({ id, status: "cancelled" });
    return { ok: true, removed: "queued" };
  }

  return { ok: false, message: "Task not found." };
});
