const fs = require("fs");
const path = require("path");
const { normalizeAdSegmentThreshold } = require("./config");
const { ensureDir, moveDirectoryContents, parseDurationSequence, buildDownloadArgs, runDownloader, prepareAdKeyword } = require("./download-helpers");

function createTaskQueue({ getMainWindow, readConfig }) {
  let currentProcess = null;
  let currentTask = null;
  let queue = [];
  let running = false;

  function notifyTaskUpdate(payload) { const win = getMainWindow(); if (win?.webContents) win.webContents.send("task:update", payload); }
  function notifyTaskLog(task, message) { notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "log", message }); }
  const callbacksFor = (task) => ({ onProcess: (child) => { currentProcess = child; }, onLog: (message) => notifyTaskLog(task, message), onTaskLog: (message) => notifyTaskLog(task, message) });

  async function runNext() {
    if (running || queue.length === 0) return;
    running = true;
    const task = queue.shift(); currentTask = task; notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "running" });
    try {
      ensureDir(task.tempShowDir); ensureDir(task.finalShowDir);
      const extraArgs = ["--use-system-proxy", task.useSystemProxy ? "true" : "false"];
      if (task.removeAds || parseDurationSequence(task.adDurationSequence).length > 0) {
        const adKeyword = await prepareAdKeyword(task, callbacksFor(task));
        if (task.cancelled) { notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" }); return; }
        if (adKeyword) extraArgs.push("--ad-keyword", adKeyword);
      }
      const code = await runDownloader(task, buildDownloadArgs(task.url, task.tempShowDir, task.tempShowDir, task.saveName, extraArgs), callbacksFor(task));
      if (code === 0) {
        try { await moveDirectoryContents(task.tempShowDir, task.finalShowDir); notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "done" }); }
        catch (error) { notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "error", message: `Move failed: ${error.message}` }); }
      } else if (task.cancelled) notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" });
      else notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "error", message: `Exit code ${code}` });
    } catch (error) {
      notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: task.cancelled ? "cancelled" : "error", message: task.cancelled ? undefined : `Task failed: ${error.message}` });
    } finally { currentTask = null; running = false; runNext(); }
  }

  function register(ipcMain) {
    ipcMain.handle("tasks:start", (event, payload) => {
      let { exePath, tempRoot, finalRoot, showName, pageId, removeAds, useSystemProxy, adSegmentThreshold, adDurationSequence, items } = payload;
      const normalizedShow = (showName || "").trim(); const storedConfig = readConfig();
      exePath = exePath || storedConfig.exePath; tempRoot = tempRoot || storedConfig.tempRoot; finalRoot = finalRoot || storedConfig.finalRoot || storedConfig.defaultFinalRoot; pageId = pageId || storedConfig.activePageId;
      removeAds = removeAds !== false; useSystemProxy = useSystemProxy === true; adSegmentThreshold = normalizeAdSegmentThreshold(adSegmentThreshold || storedConfig.adSegmentThreshold); adDurationSequence = adDurationSequence || storedConfig.adDurationSequence || "";
      if (!exePath || !tempRoot || !finalRoot || !normalizedShow) return { ok: false, message: "Missing required settings." };
      if (!fs.existsSync(exePath)) return { ok: false, message: "N_m3u8DL-RE.exe not found. Please set the path in Settings." };
      const tasks = [];
      for (const item of items || []) {
        const episodeTitle = (item.episodeTitle || "").trim(); const url = (item.url || "").trim(); if (!episodeTitle || !url) continue;
        const safeEpisode = episodeTitle.replace(/[\\/:*?"<>|]/g, "_"); const safeShow = normalizedShow.replace(/[\\/:*?"<>|]/g, "_");
        tasks.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, pageId, exePath, url, tempShowDir: path.join(tempRoot, normalizedShow), finalShowDir: path.join(finalRoot, normalizedShow), saveName: `${safeShow}_${safeEpisode}`, removeAds, useSystemProxy, adSegmentThreshold, adDurationSequence });
      }
      if (tasks.length === 0) return { ok: false, message: "No valid tasks." };
      queue.push(...tasks); for (const task of tasks) notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "queued", name: task.saveName }); runNext(); return { ok: true, tasks };
    });
    ipcMain.handle("tasks:cancel", () => { if (currentProcess) { if (currentTask) currentTask.cancelled = true; currentProcess.kill(); return true; } return false; });
    ipcMain.handle("tasks:stop-all", () => { for (const task of queue) notifyTaskUpdate({ id: task.id, pageId: task.pageId, status: "cancelled" }); queue = []; if (currentProcess) { if (currentTask) currentTask.cancelled = true; currentProcess.kill(); return true; } return false; });
    ipcMain.handle("tasks:remove", (event, id) => {
      if (!id) return { ok: false, message: "Missing task id." };
      if (currentTask?.id === id) { currentTask.cancelled = true; currentProcess?.kill(); return { ok: true, removed: "running" }; }
      const index = queue.findIndex((task) => task.id === id); if (index !== -1) { const [task] = queue.splice(index, 1); notifyTaskUpdate({ id, pageId: task.pageId, status: "cancelled" }); return { ok: true, removed: "queued" }; }
      return { ok: false, message: "Task not found." };
    });
  }
  return { register };
}
module.exports = { createTaskQueue };
