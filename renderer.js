const showNameInput = document.getElementById("showName");
const exePathInput = document.getElementById("exePath");
const tempRootInput = document.getElementById("tempRoot");
const finalRootInput = document.getElementById("finalRoot");
const removeAdsInput = document.getElementById("removeAds");
const useSystemProxyInput = document.getElementById("useSystemProxy");
const adSegmentThresholdInput = document.getElementById("adSegmentThreshold");
const batchInput = document.getElementById("batchInput");
const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");
const stopAllBtn = document.getElementById("stopAllBtn");
const selectAllBtn = document.getElementById("selectAll");
const selectNoneBtn = document.getElementById("selectNone");
const pickExeBtn = document.getElementById("pickExe");
const pickTempBtn = document.getElementById("pickTemp");
const pickFinalBtn = document.getElementById("pickFinal");
const tabMain = document.getElementById("tabMain");
const tabSettings = document.getElementById("tabSettings");
const mainView = document.getElementById("mainView");
const settingsView = document.getElementById("settingsView");
const statusEl = document.getElementById("status");
const batchStatusEl = document.getElementById("batchStatus");
const batchList = document.getElementById("batchList");
const taskList = document.getElementById("taskList");
const logEl = document.getElementById("log");
const downloadPageTabs = document.getElementById("downloadPageTabs");
const addDownloadPageBtn = document.getElementById("addDownloadPage");

let appState = {
  activePageId: "page-1",
  pages: []
};

function createEmptyPage(index) {
  return {
    id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `页面 ${index}`,
    showName: "",
    finalRoot: "",
    batchInput: "",
    batchSelection: {},
    taskState: {},
    log: ""
  };
}

function normalizePage(page, index) {
  return {
    id: page.id || `page-${index + 1}`,
    title: page.title || page.showName || `页面 ${index + 1}`,
    showName: page.showName || "",
    finalRoot: page.finalRoot || "",
    batchInput: page.batchInput || "",
    batchSelection: page.batchSelection || {},
    taskState: page.taskState || {},
    log: page.log || ""
  };
}

function getActivePage() {
  let page = appState.pages.find((item) => item.id === appState.activePageId);
  if (!page) {
    page = appState.pages[0];
    appState.activePageId = page.id;
  }
  return page;
}

function getTaskEntries(page) {
  return Object.entries(page.taskState || {});
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function setBatchStatus(message) {
  batchStatusEl.textContent = message || "";
}

function appendLogToPage(page, message) {
  page.log = `${page.log || ""}${message || ""}`;
  if (page.id === appState.activePageId) {
    logEl.textContent = page.log;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function renderTasks() {
  const page = getActivePage();
  taskList.innerHTML = "";
  for (const [id, task] of getTaskEntries(page)) {
    const row = document.createElement("div");
    row.className = `task ${task.status || "queued"}`;

    const name = document.createElement("div");
    name.className = "task-name";
    name.textContent = task.name || id;

    const status = document.createElement("div");
    status.className = "task-status";
    status.textContent = formatStatus(task.status || "queued");

    const message = document.createElement("div");
    message.className = "task-message";
    message.textContent = task.message || "";

    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (task.status === "queued" || task.status === "running") {
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn small";
      removeBtn.textContent = "删除";
      removeBtn.addEventListener("click", async () => {
        await window.api.removeTask(id);
      });
      actions.appendChild(removeBtn);
    }

    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(message);
    row.appendChild(actions);
    taskList.appendChild(row);
  }
}

function formatStatus(status) {
  switch (status) {
    case "queued":
      return "QUEUED";
    case "running":
      return "RUNNING";
    case "done":
      return "DONE";
    case "error":
      return "ERROR";
    case "cancelled":
      return "CANCELLED";
    default:
      return (status || "UNKNOWN").toUpperCase();
  }
}

function getBatchSelection(page) {
  if (!page.batchSelection) {
    page.batchSelection = {};
  }
  return page.batchSelection;
}

function renderBatchList(items) {
  const page = getActivePage();
  const selection = getBatchSelection(page);
  batchList.innerHTML = "";
  for (const item of items) {
    const key = `${item.episodeTitle}$${item.url}`;
    const checked = selection[key] !== false;

    const row = document.createElement("label");
    row.className = "batch-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => {
      selection[key] = checkbox.checked;
    });

    const text = document.createElement("span");
    text.textContent = `${item.episodeTitle}  ${item.url}`;

    row.appendChild(checkbox);
    row.appendChild(text);
    batchList.appendChild(row);
  }
}

function setActiveTab(tab) {
  if (tab === "settings") {
    tabSettings.classList.add("active");
    tabMain.classList.remove("active");
    settingsView.classList.remove("hidden");
    mainView.classList.add("hidden");
  } else {
    tabMain.classList.add("active");
    tabSettings.classList.remove("active");
    mainView.classList.remove("hidden");
    settingsView.classList.add("hidden");
  }
}

function parseAdSegmentThreshold(value) {
  const threshold = Number.parseInt(value, 10);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : 10;
}

function parseBatchInput(raw) {
  const lines = raw.split(/\r?\n/);
  const items = [];
  const errors = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split("$");
    if (parts.length < 2) {
      errors.push(`格式错误: ${trimmed}`);
      continue;
    }

    const episodeTitle = parts[0].trim();
    const url = parts.slice(1).join("$").trim();
    if (!episodeTitle || !url) {
      errors.push(`格式错误: ${trimmed}`);
      continue;
    }

    items.push({ episodeTitle, url });
  }

  return { items, errors };
}

function refreshBatchPreview() {
  const page = getActivePage();
  page.batchInput = batchInput.value;
  const { items, errors } = parseBatchInput(batchInput.value);
  if (errors.length) {
    setBatchStatus(errors[0]);
  } else {
    setBatchStatus("");
  }

  const selection = getBatchSelection(page);
  const nextKeys = new Set(items.map((item) => `${item.episodeTitle}$${item.url}`));
  for (const key of Object.keys(selection)) {
    if (!nextKeys.has(key)) {
      delete selection[key];
    }
  }
  for (const key of nextKeys) {
    if (!(key in selection)) {
      selection[key] = true;
    }
  }

  renderBatchList(items);
}

function syncActivePageFromDom() {
  if (appState.pages.length === 0) {
    return;
  }
  const page = getActivePage();
  page.showName = showNameInput.value.trim();
  page.finalRoot = finalRootInput.value.trim();
  page.batchInput = batchInput.value;
  page.log = logEl.textContent;
  page.title = page.showName || page.title || "页面";
}

function loadActivePageToDom() {
  const page = getActivePage();
  showNameInput.value = page.showName || "";
  finalRootInput.value = page.finalRoot || "";
  batchInput.value = page.batchInput || "";
  logEl.textContent = page.log || "";
  logEl.scrollTop = logEl.scrollHeight;
  refreshBatchPreview();
  renderTasks();
  setStatus("");
}

function renderDownloadPageTabs() {
  downloadPageTabs.innerHTML = "";
  for (const page of appState.pages) {
    const tab = document.createElement("button");
    tab.className = `download-page-tab${page.id === appState.activePageId ? " active" : ""}`;
    tab.textContent = page.showName || page.title || "页面";
    tab.addEventListener("click", () => {
      if (page.id === appState.activePageId) {
        return;
      }
      syncActivePageFromDom();
      appState.activePageId = page.id;
      loadActivePageToDom();
      renderDownloadPageTabs();
      saveConfig();
    });
    downloadPageTabs.appendChild(tab);
  }
}

function createDownloadPage() {
  syncActivePageFromDom();
  const page = createEmptyPage(appState.pages.length + 1);
  appState.pages.push(page);
  appState.activePageId = page.id;
  loadActivePageToDom();
  renderDownloadPageTabs();
  saveConfig();
}

async function loadConfig() {
  const config = await window.api.getConfig();
  const pages = Array.isArray(config.pages) && config.pages.length > 0
    ? config.pages
    : [{
      id: "page-1",
      title: config.showName || "页面 1",
      showName: config.showName || "",
      finalRoot: config.finalRoot || "",
      batchInput: config.batchInput || ""
    }];

  appState = {
    activePageId: config.activePageId || pages[0].id,
    pages: pages.map(normalizePage)
  };
  if (!appState.pages.some((page) => page.id === appState.activePageId)) {
    appState.activePageId = appState.pages[0].id;
  }

  exePathInput.value = config.exePath || "";
  tempRootInput.value = config.tempRoot || "";
  removeAdsInput.checked = config.removeAds !== false;
  useSystemProxyInput.checked = config.useSystemProxy === true;
  adSegmentThresholdInput.value = String(parseAdSegmentThreshold(config.adSegmentThreshold));
  loadActivePageToDom();
  renderDownloadPageTabs();
}

async function saveConfig() {
  syncActivePageFromDom();
  const activePage = getActivePage();
  const nextConfig = {
    exePath: exePathInput.value.trim(),
    tempRoot: tempRootInput.value.trim(),
    removeAds: removeAdsInput.checked,
    useSystemProxy: useSystemProxyInput.checked,
    adSegmentThreshold: parseAdSegmentThreshold(adSegmentThresholdInput.value),
    activePageId: appState.activePageId,
    pages: appState.pages.map((page) => ({
      id: page.id,
      title: page.title || page.showName || "页面",
      showName: page.showName || "",
      finalRoot: page.finalRoot || "",
      batchInput: page.batchInput || ""
    })),
    showName: activePage.showName || "",
    finalRoot: activePage.finalRoot || "",
    batchInput: activePage.batchInput || ""
  };
  await window.api.setConfig(nextConfig);
}

pickExeBtn.addEventListener("click", async () => {
  const picked = await window.api.pickExe();
  if (picked) {
    exePathInput.value = picked;
    saveConfig();
  }
});

pickTempBtn.addEventListener("click", async () => {
  const picked = await window.api.pickDir();
  if (picked) {
    tempRootInput.value = picked;
    saveConfig();
  }
});

pickFinalBtn.addEventListener("click", async () => {
  const picked = await window.api.pickDir();
  if (picked) {
    finalRootInput.value = picked;
    saveConfig();
  }
});

startBtn.addEventListener("click", async () => {
  setStatus("");
  const page = getActivePage();
  page.log = "";
  logEl.textContent = "";

  const showName = showNameInput.value.trim();
  const exePath = exePathInput.value.trim();
  const tempRoot = tempRootInput.value.trim();
  const finalRoot = finalRootInput.value.trim();
  const adSegmentThreshold = parseAdSegmentThreshold(adSegmentThresholdInput.value);
  const raw = batchInput.value;

  const { items, errors } = parseBatchInput(raw);
  if (errors.length) {
    setStatus(errors[0]);
    return;
  }

  const selection = getBatchSelection(page);
  const selectedItems = items.filter((item) => {
    const key = `${item.episodeTitle}$${item.url}`;
    return selection[key] !== false;
  });
  if (selectedItems.length === 0) {
    setStatus("请先选择要下载的集数");
    return;
  }

  const response = await window.api.startTasks({
    pageId: page.id,
    showName,
    exePath,
    tempRoot,
    finalRoot,
    removeAds: removeAdsInput.checked,
    useSystemProxy: useSystemProxyInput.checked,
    adSegmentThreshold,
    items: selectedItems
  });

  if (!response.ok) {
    setStatus(response.message || "启动失败");
    return;
  }

  page.taskState = {};
  for (const task of response.tasks) {
    page.taskState[task.id] = {
      name: task.saveName,
      status: "queued",
      message: ""
    };
  }
  renderTasks();
  renderDownloadPageTabs();
  setStatus("已加入队列");
  saveConfig();
});

cancelBtn.addEventListener("click", async () => {
  await window.api.cancelTask();
});

stopAllBtn.addEventListener("click", async () => {
  await window.api.stopAll();
  setStatus("已停止所有任务");
});

tabMain.addEventListener("click", () => setActiveTab("main"));
tabSettings.addEventListener("click", () => setActiveTab("settings"));
addDownloadPageBtn.addEventListener("click", () => createDownloadPage());

window.api.onTaskUpdate((event, payload) => {
  const page = appState.pages.find((item) => item.id === payload.pageId) || getActivePage();
  if (payload.status === "log") {
    appendLogToPage(page, payload.message || "");
    return;
  }

  if (!page.taskState) {
    page.taskState = {};
  }
  const task = page.taskState[payload.id] || { name: payload.name || payload.id };
  if (payload.name) {
    task.name = payload.name;
  }
  if (payload.status) {
    task.status = payload.status;
  }
  if (payload.message) {
    task.message = payload.message;
  }
  page.taskState[payload.id] = task;
  if (page.id === appState.activePageId) {
    renderTasks();
  }
});

showNameInput.addEventListener("input", () => {
  syncActivePageFromDom();
  renderDownloadPageTabs();
  saveConfig();
});
exePathInput.addEventListener("input", () => saveConfig());
tempRootInput.addEventListener("input", () => saveConfig());
finalRootInput.addEventListener("input", () => saveConfig());
removeAdsInput.addEventListener("change", () => saveConfig());
useSystemProxyInput.addEventListener("change", () => saveConfig());
adSegmentThresholdInput.addEventListener("input", () => saveConfig());
batchInput.addEventListener("input", () => {
  refreshBatchPreview();
  saveConfig();
});

loadConfig();
setActiveTab("main");

selectAllBtn.addEventListener("click", () => {
  const selection = getBatchSelection(getActivePage());
  for (const key of Object.keys(selection)) {
    selection[key] = true;
  }
  refreshBatchPreview();
});

selectNoneBtn.addEventListener("click", () => {
  const selection = getBatchSelection(getActivePage());
  for (const key of Object.keys(selection)) {
    selection[key] = false;
  }
  refreshBatchPreview();
});
