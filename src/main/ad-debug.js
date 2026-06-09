const fs = require("fs");
const path = require("path");
const { ensureDir, runFfmpegFirstFrame, parseMetaSelected } = require("./download-helpers");

function registerAdDebugIpc(ipcMain, { readConfig, getMainWindow }) {
  const notifyLog = (message) => { const win = getMainWindow?.(); if (win?.webContents) win.webContents.send("ad-debug:log", message); };
  ipcMain.handle("ad-debug:first-frame", async (event, payload) => {
    const storedConfig = readConfig(); const exePath = payload?.exePath || storedConfig.exePath; const tempRoot = payload?.tempRoot || storedConfig.tempRoot; const url = (payload?.url || "").trim();
    if (!tempRoot || !url) return { ok: false, message: "缺少临时目录或片段 URL。" };
    const frameTmpDir = path.join(tempRoot, `ad-debug-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`); const framePath = path.join(frameTmpDir, "first-frame.png");
    try { ensureDir(frameTmpDir); await runFfmpegFirstFrame(url, framePath, exePath); const image = await fs.promises.readFile(framePath); return { ok: true, imageUrl: `data:image/png;base64,${image.toString("base64")}` }; }
    catch (error) { return { ok: false, message: error.message }; }
    finally { await fs.promises.rm(frameTmpDir, { recursive: true, force: true }); }
  });
  ipcMain.handle("ad-debug:meta", async (event, payload) => {
    const storedConfig = readConfig(); const exePath = payload?.exePath || storedConfig.exePath; const tempRoot = payload?.tempRoot || storedConfig.tempRoot; const useSystemProxy = "useSystemProxy" in (payload || {}) ? payload.useSystemProxy === true : storedConfig.useSystemProxy === true; const url = (payload?.url || "").trim();
    if (!exePath || !tempRoot || !url) return { ok: false, message: "请先填写 m3u8 地址，并配置程序路径和临时目录。" };
    if (!fs.existsSync(exePath)) return { ok: false, message: "N_m3u8DL-RE.exe not found. Please set the path in Settings." };
    const parseTmpDir = path.join(tempRoot, `ad-debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`); const task = { id: "ad-debug", pageId: "ad-debug", exePath, url, useSystemProxy, saveName: "ad-debug" };
    try { const parsed = await parseMetaSelected(task, parseTmpDir, { onLog: notifyLog }); return parsed ? { ok: true, metaText: parsed.metaText, metaPath: parsed.metaPath } : { ok: false, message: "解析已取消。" }; }
    catch (error) { return { ok: false, message: error.message }; }
    finally { await fs.promises.rm(parseTmpDir, { recursive: true, force: true }); }
  });
}
module.exports = { registerAdDebugIpc };
