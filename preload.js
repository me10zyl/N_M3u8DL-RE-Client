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
  debugAdMeta: (payload) => ipcRenderer.invoke("ad-debug:meta", payload),
  debugAdFirstFrame: (payload) => ipcRenderer.invoke("ad-debug:first-frame", payload),
  cmsListSources: () => ipcRenderer.invoke("cms:sources:list"),
  cmsSaveSource: (payload) => ipcRenderer.invoke("cms:sources:save", payload),
  cmsDeleteSource: (id) => ipcRenderer.invoke("cms:sources:delete", id),
  cmsTestSource: (payload) => ipcRenderer.invoke("cms:sources:test", payload),
  onAdDebugLog: (handler) => ipcRenderer.on("ad-debug:log", handler),
  onTaskUpdate: (handler) => ipcRenderer.on("task:update", handler)
});
