function registerShellIpc(ipcMain, shell) {
  ipcMain.handle("shell:open-external", async (event, url) => {
    const target = String(url || "").trim();
    if (!/^https?:\/\//i.test(target)) return { ok: false, message: "Only http(s) URLs can be opened." };
    await shell.openExternal(target); return { ok: true };
  });
}
module.exports = { registerShellIpc };
