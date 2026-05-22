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
const openAdDebugBtn = document.getElementById("openAdDebug");
const closeAdDebugBtn = document.getElementById("closeAdDebug");
const adDebugModal = document.getElementById("adDebugModal");
const adDebugUrlInput = document.getElementById("adDebugUrl");
const loadAdDebugMetaBtn = document.getElementById("loadAdDebugMeta");
const adDebugSearchInput = document.getElementById("adDebugSearch");
const adDebugPrevBtn = document.getElementById("adDebugPrev");
const adDebugNextBtn = document.getElementById("adDebugNext");
const adDebugSearchStatus = document.getElementById("adDebugSearchStatus");
const adDebugThresholdInput = document.getElementById("adDebugThreshold");
const findAdSegmentsBtn = document.getElementById("findAdSegments");
const durationSequenceInput = document.getElementById("durationSequence");
const findDurationSequenceBtn = document.getElementById("findDurationSequence");
const adDebugStatus = document.getElementById("adDebugStatus");
const adDebugMetaEl = document.getElementById("adDebugMeta");
const adDebugResultEl = document.getElementById("adDebugResult");
const adDebugResultHintEl = document.getElementById("adDebugResultHint");
const adDebugPreviewEl = document.getElementById("adDebugPreview");

let adDebugMetaText = "";
let adDebugMeta = null;
let adDebugSearchMatches = [];
let adDebugSearchIndex = -1;

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

function getSegmentFilename(url) {
  const text = String(url || "").trim();
  if (!text) {
    return "";
  }

  try {
    return new URL(text).pathname.split("/").pop() || "";
  } catch (error) {
    return text.split(/[?#]/)[0].split(/[\\/]/).pop() || "";
  }
}

function extractSuspiciousAdSegments(meta, adSegmentThreshold = 10) {
  const threshold = parseAdSegmentThreshold(adSegmentThreshold);
  const matches = [];
  if (!Array.isArray(meta)) {
    return matches;
  }

  for (const item of meta) {
    const mediaParts = item && item.Playlist && Array.isArray(item.Playlist.MediaParts)
      ? item.Playlist.MediaParts
      : [];

    for (const part of mediaParts) {
      const segments = part && Array.isArray(part.MediaSegments) ? part.MediaSegments : [];
      if (segments.length === 0 || segments.length >= threshold) {
        continue;
      }

      segments.forEach((segment, index) => {
        const filename = getSegmentFilename(segment && segment.Url);
        if (filename) {
          matches.push({
            filename,
            index,
            duration: segment && segment.Duration,
            groupSize: segments.length,
            url: segment && segment.Url || ""
          });
        }
      });
    }
  }

  return matches;
}

function getAllMediaSegments(meta) {
  const segments = [];
  if (!Array.isArray(meta)) {
    return segments;
  }

  for (const item of meta) {
    const mediaParts = item && item.Playlist && Array.isArray(item.Playlist.MediaParts)
      ? item.Playlist.MediaParts
      : [];
    for (const part of mediaParts) {
      if (part && Array.isArray(part.MediaSegments)) {
        segments.push(...part.MediaSegments);
      }
    }
  }
  return segments;
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

function setAdDebugStatus(message) {
  adDebugStatus.textContent = message || "";
}

function appendAdDebugLog(message) {
  adDebugResultHintEl.classList.add("hidden");
  adDebugResultEl.textContent = `${adDebugResultEl.textContent || ""}${message || ""}`;
  adDebugResultEl.scrollTop = adDebugResultEl.scrollHeight;
}

function renderAdDebugSegmentResults(matches) {
  adDebugResultEl.textContent = "";
  adDebugResultHintEl.classList.remove("hidden");
  if (matches.length === 0) {
    adDebugResultEl.textContent = "未发现匹配的疑似广告片段";
    return;
  }

  matches.forEach((match) => {
    const link = document.createElement("a");
    link.href = match.url;
    link.textContent = `${match.filename} [${match.index}] [${match.duration}] [${match.groupSize}] [${match.url}]`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      adDebugPreviewEl.src = match.url;
      adDebugPreviewEl.classList.remove("hidden");
      adDebugPreviewEl.play().catch(() => {});
      setAdDebugStatus(`正在预览片段：${match.filename}`);
    });
    adDebugResultEl.appendChild(link);
    adDebugResultEl.appendChild(document.createTextNode("\n"));
  });
}

function renderAdDebugMeta(text) {
  adDebugMetaEl.textContent = text || "";
  adDebugMetaEl.scrollTop = 0;
  adDebugSearchMatches = [];
  adDebugSearchIndex = -1;
  updateAdDebugSearchStatus();
}

function updateAdDebugSearchStatus() {
  if (!adDebugSearchInput.value.trim()) {
    adDebugSearchStatus.textContent = "";
    return;
  }
  if (adDebugSearchMatches.length === 0) {
    adDebugSearchStatus.textContent = "0/0";
    return;
  }
  adDebugSearchStatus.textContent = `${adDebugSearchIndex + 1}/${adDebugSearchMatches.length}`;
}

function refreshAdDebugSearch() {
  const query = adDebugSearchInput.value;
  adDebugSearchMatches = [];
  adDebugSearchIndex = -1;
  if (!query || !adDebugMetaText) {
    updateAdDebugSearchStatus();
    return;
  }

  let index = adDebugMetaText.indexOf(query);
  while (index !== -1) {
    adDebugSearchMatches.push(index);
    index = adDebugMetaText.indexOf(query, index + query.length);
  }
  if (adDebugSearchMatches.length > 0) {
    adDebugSearchIndex = 0;
    scrollAdDebugMetaToIndex(adDebugSearchMatches[adDebugSearchIndex]);
  }
  updateAdDebugSearchStatus();
}

function scrollAdDebugMetaToIndex(index) {
  const before = adDebugMetaText.slice(0, index);
  const line = before.split("\n").length - 1;
  const totalLines = Math.max(1, adDebugMetaText.split("\n").length);
  adDebugMetaEl.scrollTop = (line / totalLines) * adDebugMetaEl.scrollHeight;
}

function moveAdDebugSearch(step) {
  if (adDebugSearchMatches.length === 0) {
    updateAdDebugSearchStatus();
    return;
  }
  adDebugSearchIndex = (adDebugSearchIndex + step + adDebugSearchMatches.length) % adDebugSearchMatches.length;
  scrollAdDebugMetaToIndex(adDebugSearchMatches[adDebugSearchIndex]);
  updateAdDebugSearchStatus();
}

function parseDurationSequence(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findDurationSequence(meta, sequence) {
  const segments = getAllMediaSegments(meta);
  if (sequence.length === 0) {
    return -1;
  }

  for (let i = 0; i <= segments.length - sequence.length; i += 1) {
    let matched = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (String(segments[i + j] && segments[i + j].Duration) !== sequence[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }
  return -1;
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
  adDebugUrlInput.value = config.adDebugUrl || "";
  adDebugThresholdInput.value = String(parseAdSegmentThreshold(config.adDebugThreshold || config.adSegmentThreshold));
  adDebugSearchInput.value = config.adDebugSearch || "";
  durationSequenceInput.value = config.adDebugDurationSequence || "";
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
    adDebugUrl: adDebugUrlInput.value.trim(),
    adDebugThreshold: parseAdSegmentThreshold(adDebugThresholdInput.value),
    adDebugSearch: adDebugSearchInput.value,
    adDebugDurationSequence: durationSequenceInput.value,
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
openAdDebugBtn.addEventListener("click", () => {
  if (!adDebugThresholdInput.value) {
    adDebugThresholdInput.value = adSegmentThresholdInput.value || "10";
  }
  adDebugModal.classList.remove("hidden");
});
closeAdDebugBtn.addEventListener("click", () => {
  adDebugModal.classList.add("hidden");
});
loadAdDebugMetaBtn.addEventListener("click", async () => {
  const url = adDebugUrlInput.value.trim();
  if (!url) {
    setAdDebugStatus("请输入 m3u8 地址");
    return;
  }

  setAdDebugStatus("正在获取 meta_selected.json...");
  adDebugResultEl.textContent = "";
  adDebugResultHintEl.classList.add("hidden");
  adDebugPreviewEl.removeAttribute("src");
  adDebugPreviewEl.classList.add("hidden");
  const response = await window.api.debugAdMeta({
    url,
    exePath: exePathInput.value.trim(),
    tempRoot: tempRootInput.value.trim(),
    useSystemProxy: useSystemProxyInput.checked
  });
  if (!response.ok) {
    setAdDebugStatus(response.message || "获取失败");
    return;
  }

  adDebugMetaText = response.metaText || "";
  adDebugMeta = JSON.parse(adDebugMetaText);
  renderAdDebugMeta(JSON.stringify(adDebugMeta, null, 2));
  adDebugMetaText = adDebugMetaEl.textContent;
  setAdDebugStatus(`已获取：${response.metaPath}`);
});
adDebugSearchInput.addEventListener("input", () => {
  refreshAdDebugSearch();
  saveConfig();
});
adDebugUrlInput.addEventListener("input", () => saveConfig());
adDebugThresholdInput.addEventListener("input", () => saveConfig());
durationSequenceInput.addEventListener("input", () => saveConfig());
adDebugPrevBtn.addEventListener("click", () => moveAdDebugSearch(-1));
adDebugNextBtn.addEventListener("click", () => moveAdDebugSearch(1));
findAdSegmentsBtn.addEventListener("click", () => {
  if (!adDebugMeta) {
    setAdDebugStatus("请先获取 meta_selected.json");
    return;
  }
  const matches = extractSuspiciousAdSegments(adDebugMeta, adDebugThresholdInput.value);
  renderAdDebugSegmentResults(matches);
});
findDurationSequenceBtn.addEventListener("click", () => {
  if (!adDebugMeta) {
    setAdDebugStatus("请先获取 meta_selected.json");
    return;
  }
  const sequence = parseDurationSequence(durationSequenceInput.value);
  const index = findDurationSequence(adDebugMeta, sequence);
  if (index === -1) {
    adDebugResultEl.textContent = "未找到连续匹配的 duration 序列";
    return;
  }

  const firstDuration = `\"Duration\": ${sequence[0]}`;
  const metaIndex = adDebugMetaText.indexOf(firstDuration);
  if (metaIndex !== -1) {
    scrollAdDebugMetaToIndex(metaIndex);
  }
  adDebugResultEl.textContent = `找到连续匹配，起始 MediaSegments 索引：${index}`;
});

window.api.onAdDebugLog((event, message) => {
  appendAdDebugLog(message);
});

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
