const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
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
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

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
