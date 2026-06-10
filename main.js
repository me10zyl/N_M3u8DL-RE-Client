const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const { createConfigStore, registerConfigIpc } = require("./src/main/config");
const { registerDialogIpc } = require("./src/main/dialogs");
const { createTaskQueue } = require("./src/main/tasks");
const { registerAdDebugIpc } = require("./src/main/ad-debug");
const { registerCmsIpc } = require("./src/main/cms");
const { registerShellIpc } = require("./src/main/shell");

let mainWindow;
const configStore = createConfigStore(app);
function getMainWindow() { return mainWindow; }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
    icon: path.join(__dirname, 'icon.png')
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("system:shutdown", () => new Promise((resolve) => {
  if (process.platform !== "win32") {
    resolve({ ok: false, message: "Shutdown is only supported on Windows." });
    return;
  }
  execFile("shutdown", ["/s", "/t", "60"], (error) => {
    resolve(error ? { ok: false, message: error.message } : { ok: true });
  });
}));

registerConfigIpc(ipcMain, configStore);
registerDialogIpc(ipcMain, dialog, getMainWindow);
registerAdDebugIpc(ipcMain, { readConfig: configStore.readConfig, getMainWindow });
createTaskQueue({ getMainWindow, readConfig: configStore.readConfig }).register(ipcMain);
registerCmsIpc(ipcMain, configStore);
registerShellIpc(ipcMain, shell);

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
