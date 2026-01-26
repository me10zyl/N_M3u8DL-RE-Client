const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (config) => ipcRenderer.invoke("config:set", config),
  pickExe: () => ipcRenderer.invoke("dialog:pick-exe"),
  pickDir: () => ipcRenderer.invoke("dialog:pick-dir"),
  startTasks: (payload) => ipcRenderer.invoke("tasks:start", payload),
  cancelTask: () => ipcRenderer.invoke("tasks:cancel"),
  stopAll: () => ipcRenderer.invoke("tasks:stop-all"),
  removeTask: (id) => ipcRenderer.invoke("tasks:remove", id),
  onTaskUpdate: (handler) => ipcRenderer.on("task:update", handler)
});
