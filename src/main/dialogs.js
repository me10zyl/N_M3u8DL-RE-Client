function registerDialogIpc(ipcMain, dialog, getMainWindow) {
  ipcMain.handle("dialog:pick-exe", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), { properties: ["openFile"], filters: [{ name: "Executable", extensions: ["exe"] }] });
    return result.canceled || result.filePaths.length === 0 ? "" : result.filePaths[0];
  });
  ipcMain.handle("dialog:pick-dir", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), { properties: ["openDirectory"] });
    return result.canceled || result.filePaths.length === 0 ? "" : result.filePaths[0];
  });
}
module.exports = { registerDialogIpc };
