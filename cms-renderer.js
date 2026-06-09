const cmsStatusEl = document.getElementById("cmsStatus");
const cmsListPanelEl = document.getElementById("cmsListPanel");
const cmsDetailPanelEl = document.getElementById("cmsDetailPanel");
const cmsDetailBodyEl = document.getElementById("cmsDetailBody");
const cmsDetailStatusEl = document.getElementById("cmsDetailStatus");
const cmsBackToListBtn = document.getElementById("cmsBackToListBtn");
const cmsSourceSelectEl = document.getElementById("cmsSourceSelect");
const cmsSourcePickerEl = document.getElementById("cmsSourcePicker");
const cmsSourcePickerBtn = document.getElementById("cmsSourcePickerBtn");
const cmsSourcePickerNameEl = document.getElementById("cmsSourcePickerName");
const cmsSourcePickerMenuEl = document.getElementById("cmsSourcePickerMenu");
const cmsCategoryRowEl = document.getElementById("cmsCategoryRow");
const cmsVideoGridEl = document.getElementById("cmsVideoGrid");
const cmsSearchInputEl = document.getElementById("cmsSearchInput");
const cmsSearchBtn = document.getElementById("cmsSearchBtn");
const cmsPageInfoEl = document.getElementById("cmsPageInfo");
const cmsPrevPageBtn = document.getElementById("cmsPrevPageBtn");
const cmsNextPageBtn = document.getElementById("cmsNextPageBtn");
const cmsDownloadQueueBtn = document.getElementById("cmsDownloadQueueBtn");
const cmsDownloadPopover = document.getElementById("cmsDownloadPopover");
const openCmsDownloadDetailBtn = document.getElementById("openCmsDownloadDetailBtn");
const cmsDownloadModal = document.getElementById("cmsDownloadModal");
const closeCmsDownloadModalBtn = document.getElementById("closeCmsDownloadModalBtn");
const cmsDownloadNameModal = document.getElementById("cmsDownloadNameModal");
const cmsPlayerModal = document.getElementById("cmsPlayerModal");
const closeCmsPlayerModalBtn = document.getElementById("closeCmsPlayerModalBtn");
const cmsPlayerTitleEl = document.getElementById("cmsPlayerTitle");
const cmsPlayerStatusEl = document.getElementById("cmsPlayerStatus");
const closeCmsDownloadNameModalBtn = document.getElementById("closeCmsDownloadNameModalBtn");
const cancelCmsDownloadNameBtn = document.getElementById("cancelCmsDownloadNameBtn");
const confirmCmsDownloadNameBtn = document.getElementById("confirmCmsDownloadNameBtn");
const cmsDownloadShowNameInput = document.getElementById("cmsDownloadShowNameInput");
const cmsDownloadNameStatusEl = document.getElementById("cmsDownloadNameStatus");
const cmsStopAllFromDetailBtn = document.getElementById("cmsStopAllFromDetailBtn");
const cmsDownloadSummaryEl = document.getElementById("cmsDownloadSummary");
const cmsDownloadMiniListEl = document.getElementById("cmsDownloadMiniList");
const cmsDownloadTaskListEl = document.getElementById("cmsDownloadTaskList");
const cmsDownloadLogEl = document.getElementById("cmsDownloadLog");
const cmsSourceNameInput = document.getElementById("cmsSourceName");
const cmsSourceApiUrlInput = document.getElementById("cmsSourceApiUrl");
const cmsSourceEnabledInput = document.getElementById("cmsSourceEnabled");
const saveCmsSourceBtn = document.getElementById("saveCmsSource");
const newCmsSourceBtn = document.getElementById("newCmsSource");
const testCmsSourceBtn = document.getElementById("testCmsSource");
const cmsSettingsStatusEl = document.getElementById("cmsSettingsStatus");
const cmsSourceListEl = document.getElementById("cmsSourceList");
const cmsHistoryListEl = document.getElementById("cmsHistoryList");
const cmsConsoleCardEl = document.getElementById("cmsConsoleCard");
const cmsConsoleEl = document.getElementById("cmsConsole");
const clearCmsConsoleBtn = document.getElementById("clearCmsConsole");
const toggleCmsConsoleBtn = document.getElementById("toggleCmsConsoleBtn");
const cmsConsoleBadgeEl = document.getElementById("cmsConsoleBadge");

let cmsState = {
  activeSourceId: "",
  sources: [],
  editingSourceId: "",
  history: []
};
let cmsSearchRequestId = 0;
let cmsCategoriesRequestId = 0;
let cmsDetailRequestId = 0;
let cmsCategoryTree = [];
let cmsSelectedCategory = {
  typeId: 0,
  typeName: "全部",
  parentTypeId: 0,
  parentTypeName: ""
};
let cmsSearchState = {
  keyword: "",
  page: 1,
  pageCount: 1,
  total: 0,
  items: []
};
let cmsDetailState = {
  item: null,
  loading: false,
  episodeSelection: {},
  currentPlayingKey: "",
  currentPlayingLabel: "",
  currentPlayingUrl: "",
  playerError: "",
  source: null
};
let cmsDownloadTaskState = {};
let cmsDownloadActiveGroupKey = "__all__";
let cmsLastDetailDownloadGroupKey = "";
let cmsDetailDownloadGroupKeys = {};
let cmsPendingDownloadDetail = null;
let cmsPendingDownloadEpisodes = [];
let cmsHlsPlayer = null;
let isCmsConsoleCollapsed = true;
let cmsConsoleUnreadCount = 0;

function buildCmsSearchRequestUrl(source, { keyword, page, typeId } = {}) {
  try {
    const url = new URL(source.apiUrl);
    url.searchParams.set("ac", "videolist");
    url.searchParams.set("pg", String(page));
    if (String(keyword || "").trim()) {
      url.searchParams.set("wd", String(keyword || "").trim());
    } else {
      url.searchParams.delete("wd");
    }
    const safeTypeId = Number.parseInt(typeId, 10);
    if (Number.isFinite(safeTypeId) && safeTypeId > 0) {
      url.searchParams.set("t", String(safeTypeId));
    } else {
      url.searchParams.delete("t");
    }
    return url.toString();
  } catch (error) {
    return "";
  }
}

function buildCmsCategoryRequestUrl(source) {
  try {
    const url = new URL(source.apiUrl);
    url.searchParams.set("ac", "list");
    url.searchParams.set("pg", "1");
    return url.toString();
  } catch (error) {
    return "";
  }
}

function setCmsCategorySelection(category) {
  cmsSelectedCategory = {
    typeId: Number.parseInt(category && category.typeId, 10) || 0,
    typeName: category && category.typeName ? String(category.typeName) : "全部",
    parentTypeId: Number.parseInt(category && category.parentTypeId, 10) || 0,
    parentTypeName: category && category.parentTypeName ? String(category.parentTypeName) : ""
  };
}

function getCategoryDisplayLabel(category) {
  return category.typeName || "未命名分类";
}

function getSelectedCmsCategoryLabel() {
  if (!cmsSelectedCategory.typeId) {
    return "全部";
  }
  if (cmsSelectedCategory.parentTypeName) {
    return `${cmsSelectedCategory.parentTypeName} / ${cmsSelectedCategory.typeName}`;
  }
  return cmsSelectedCategory.typeName;
}

function flattenCmsCategoryChildren(root) {
  return Array.isArray(root.children) ? root.children : [];
}

function setCmsView(viewName) {
  const showDetail = viewName === "detail";
  cmsListPanelEl.classList.toggle("hidden", showDetail);
  cmsDetailPanelEl.classList.toggle("hidden", !showDetail);
}

function setCmsStatus(message) {
  cmsStatusEl.textContent = message || "";
}

function setCmsSettingsStatus(message) {
  cmsSettingsStatusEl.textContent = message || "";
}

function setCmsDetailStatus(message) {
  cmsDetailStatusEl.textContent = message || "";
}

function updateCmsConsoleBadge() {
  if (isCmsConsoleCollapsed) {
    cmsConsoleBadgeEl.textContent = cmsConsoleUnreadCount > 0
      ? `有 ${cmsConsoleUnreadCount} 条新日志，点击展开`
      : "点击展开查看请求响应";
    return;
  }
  cmsConsoleBadgeEl.textContent = "点击收起";
}

function setCmsConsoleCollapsed(collapsed) {
  isCmsConsoleCollapsed = collapsed;
  cmsConsoleCardEl.classList.toggle("collapsed", collapsed);
  cmsConsoleEl.classList.toggle("hidden", collapsed);
  toggleCmsConsoleBtn.setAttribute("aria-expanded", String(!collapsed));
  if (!collapsed) {
    cmsConsoleUnreadCount = 0;
    cmsConsoleEl.scrollTop = cmsConsoleEl.scrollHeight;
  }
  updateCmsConsoleBadge();
}

function toggleCmsConsole() {
  setCmsConsoleCollapsed(!isCmsConsoleCollapsed);
}

function appendCmsConsole(message, detail) {
  const maxConsoleLength = 100000;
  const time = new Date().toLocaleTimeString();
  const lines = [`[${time}] ${message}`];
  if (detail !== undefined && detail !== null) {
    lines.push(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
  const nextText = `${cmsConsoleEl.textContent}${lines.join("\n")}\n`;
  cmsConsoleEl.textContent = nextText.length > maxConsoleLength ? nextText.slice(-maxConsoleLength) : nextText;
  if (isCmsConsoleCollapsed) {
    cmsConsoleUnreadCount += 1;
    updateCmsConsoleBadge();
    return;
  }
  cmsConsoleEl.scrollTop = cmsConsoleEl.scrollHeight;
  updateCmsConsoleBadge();
}

function appendCmsHttpResponseToConsole(response) {
  if (!response) {
    return;
  }
  appendCmsConsole("HTTP 响应", {
    statusCode: response.statusCode,
    contentType: response.contentType,
    bytes: response.bytes,
    headers: response.headers,
    rawTextPreview: response.rawTextPreview,
    jsonPreview: response.jsonPreview
  });
}

function getSelectedCmsSource() {
  return cmsState.sources.find((source) => source.id === cmsSourceSelectEl.value) || null;
}

function getEditingPayload() {
  return {
    id: cmsState.editingSourceId,
    name: cmsSourceNameInput.value.trim(),
    apiUrl: cmsSourceApiUrlInput.value.trim(),
    enabled: cmsSourceEnabledInput.checked
  };
}

function clearCmsSourceForm() {
  cmsState.editingSourceId = "";
  cmsSourceNameInput.value = "";
  cmsSourceApiUrlInput.value = "";
  cmsSourceEnabledInput.checked = true;
  setCmsSettingsStatus("");
}

function editCmsSource(source) {
  cmsState.editingSourceId = source.id;
  cmsSourceNameInput.value = source.name || "";
  cmsSourceApiUrlInput.value = source.apiUrl || "";
  cmsSourceEnabledInput.checked = source.enabled !== false;
  setCmsSettingsStatus(`正在编辑：${source.name}`);
}

function closeCmsSourcePicker() {
  cmsSourcePickerMenuEl.classList.add("hidden");
  cmsSourcePickerBtn.setAttribute("aria-expanded", "false");
}

function openCmsSourcePicker() {
  if (!cmsState.sources.length) {
    return;
  }
  cmsSourcePickerMenuEl.classList.remove("hidden");
  cmsSourcePickerBtn.setAttribute("aria-expanded", "true");
}

function toggleCmsSourcePicker() {
  if (cmsSourcePickerMenuEl.classList.contains("hidden")) {
    openCmsSourcePicker();
    return;
  }
  closeCmsSourcePicker();
}

function selectCmsSource(sourceId) {
  if (cmsSourceSelectEl.value === sourceId) {
    closeCmsSourcePicker();
    return;
  }
  cmsSourceSelectEl.value = sourceId;
  closeCmsSourcePicker();
  cmsSourceSelectEl.dispatchEvent(new Event("change"));
}

function renderCmsSourceSelect() {
  cmsSourceSelectEl.innerHTML = "";
  cmsSourcePickerMenuEl.innerHTML = "";
  if (cmsState.sources.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未配置资源站";
    cmsSourceSelectEl.appendChild(option);
    cmsSourcePickerNameEl.textContent = "未配置资源站";
    cmsSourcePickerBtn.disabled = true;
    closeCmsSourcePicker();
    return;
  }

  cmsSourcePickerBtn.disabled = false;
  for (const source of cmsState.sources) {
    const label = source.enabled === false ? `${source.name}（已禁用）` : source.name;
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = label;
    option.selected = source.id === cmsState.activeSourceId;
    cmsSourceSelectEl.appendChild(option);

    const item = document.createElement("button");
    item.className = `cms-source-picker-option${source.id === cmsState.activeSourceId ? " active" : ""}${source.enabled === false ? " disabled" : ""}`;
    item.type = "button";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(source.id === cmsState.activeSourceId));
    item.dataset.sourceId = source.id;

    const name = document.createElement("span");
    name.className = "cms-source-picker-option-name";
    name.textContent = source.name || "未命名资源站";
    const status = document.createElement("span");
    status.className = "cms-source-picker-option-status";
    status.textContent = source.enabled === false ? "已禁用" : "可用";

    item.appendChild(name);
    item.appendChild(status);
    item.addEventListener("click", () => selectCmsSource(source.id));
    cmsSourcePickerMenuEl.appendChild(item);
  }

  const activeSource = getSelectedCmsSource();
  cmsSourcePickerNameEl.textContent = activeSource
    ? (activeSource.enabled === false ? `${activeSource.name}（已禁用）` : activeSource.name)
    : "请选择资源站";
  closeCmsSourcePicker();
}

function renderCmsSourceList() {
  cmsSourceListEl.innerHTML = "";
  if (cmsState.sources.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task";
    empty.textContent = "暂无资源站，请填写名称和接口地址后保存。";
    cmsSourceListEl.appendChild(empty);
    return;
  }

  for (const source of cmsState.sources) {
    const row = document.createElement("div");
    row.className = "task cms-source-row";

    const name = document.createElement("div");
    name.className = "task-name";
    name.textContent = source.name;

    const status = document.createElement("div");
    status.className = "task-status";
    status.textContent = source.enabled === false ? "DISABLED" : "ENABLED";

    const url = document.createElement("div");
    url.className = "task-message";
    url.textContent = source.apiUrl;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn small";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => editCmsSource(source));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn small danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", async () => {
      const response = await window.api.cmsDeleteSource(source.id);
      if (!response.ok) {
        setCmsSettingsStatus(response.message || "删除失败");
        return;
      }
      clearCmsSourceForm();
      await loadCmsSources();
      setCmsSettingsStatus("已删除资源站");
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    row.appendChild(name);
    row.appendChild(status);
    row.appendChild(url);
    row.appendChild(actions);
    cmsSourceListEl.appendChild(row);
  }
}

function renderCmsPlaceholder(message) {
  cmsPageInfoEl.textContent = "占位";
  cmsPrevPageBtn.disabled = true;
  cmsNextPageBtn.disabled = true;
  cmsVideoGridEl.innerHTML = "";
  setCmsView("list");
  const placeholder = document.createElement("div");
  placeholder.className = "cms-placeholder";
  placeholder.textContent = message || (cmsState.sources.length > 0
    ? "正在等待 CMS 影片列表。"
    : "请先在 CMS 设置中新增资源站。");
  cmsVideoGridEl.appendChild(placeholder);
  cmsDownloadSummaryEl.textContent = "暂无 CMS 下载任务。";
  if (cmsDownloadMiniListEl) {
    cmsDownloadMiniListEl.textContent = "暂无任务";
  }
  cmsDownloadTaskListEl.textContent = "暂无任务";
}

function renderCmsPagination() {
  const page = cmsSearchState.page || 1;
  const pageCount = cmsSearchState.pageCount || 1;
  cmsPageInfoEl.textContent = `第 ${page} / ${pageCount} 页，共 ${cmsSearchState.total || 0} 条`;
  cmsPrevPageBtn.disabled = page <= 1;
  cmsNextPageBtn.disabled = page >= pageCount;
}

function createCmsVideoMeta(label, value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const meta = document.createElement("div");
  meta.className = "cms-video-meta";
  meta.textContent = `${label}：${text}`;
  return meta;
}

function setCmsVideoCardInteractive(card, item) {
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `查看 ${item.name || "未命名影片"} 详情`);
  const openDetail = () => {
    loadCmsDetail(item);
  };
  card.addEventListener("click", openDetail);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  });
}

function renderCmsVideos(items) {
  cmsVideoGridEl.innerHTML = "";
  if (!items.length) {
    renderCmsPlaceholder("未找到影片。");
    renderCmsPagination();
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "cms-video-card";

    if (item.pic) {
      const poster = document.createElement("img");
      poster.className = "cms-video-poster";
      poster.src = item.pic;
      poster.alt = item.name || "未命名影片";
      poster.loading = "lazy";
      card.appendChild(poster);
    }

    const title = document.createElement("h3");
    title.textContent = item.name || "未命名影片";

    const remarks = document.createElement("div");
    remarks.className = "cms-video-remarks";
    remarks.textContent = item.remarks || "点击查看详情";

    const summary = document.createElement("div");
    summary.className = "cms-video-summary";
    summary.textContent = [item.type, item.year, item.area].filter(Boolean).join(" / ") || "暂无分类信息";

    const actor = createCmsVideoMeta("演员", item.actor);
    const director = createCmsVideoMeta("导演", item.director);

    card.appendChild(title);
    card.appendChild(remarks);
    card.appendChild(summary);
    if (actor) {
      card.appendChild(actor);
    }
    if (director) {
      card.appendChild(director);
    }
    setCmsVideoCardInteractive(card, item);
    cmsVideoGridEl.appendChild(card);
  }
  setCmsView("list");
  renderCmsPagination();
}

function formatCmsHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return date.toLocaleString();
}

function renderCmsHistoryPlaceholder(message) {
  cmsHistoryListEl.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "cms-placeholder";
  placeholder.textContent = message || "暂无历史记录。点击影片进入详情后会出现在这里。";
  cmsHistoryListEl.appendChild(placeholder);
}

function openCmsHistoryDetail(item) {
  setCmsPanel("list");
  loadCmsDetail(item);
}

function renderCmsHistory() {
  cmsHistoryListEl.innerHTML = "";
  if (!cmsState.history.length) {
    renderCmsHistoryPlaceholder();
    return;
  }

  for (const item of cmsState.history) {
    const card = document.createElement("article");
    card.className = "cms-video-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `查看历史影片 ${item.name || "未命名影片"} 详情`);

    if (item.pic) {
      const poster = document.createElement("img");
      poster.className = "cms-video-poster";
      poster.src = item.pic;
      poster.alt = item.name || "未命名影片";
      poster.loading = "lazy";
      card.appendChild(poster);
    }

    const title = document.createElement("h3");
    title.textContent = item.name || "未命名影片";
    const remarks = document.createElement("div");
    remarks.className = "cms-video-remarks";
    remarks.textContent = item.remarks || "点击查看详情";
    const summary = document.createElement("div");
    summary.className = "cms-video-summary";
    summary.textContent = [item.type, item.year, item.area].filter(Boolean).join(" / ") || "暂无分类信息";
    const sourceMeta = createCmsVideoMeta("来源", item.sourceName || item.sourceId);
    const timeMeta = createCmsVideoMeta("点击时间", formatCmsHistoryTime(item.viewedAt));

    card.appendChild(title);
    card.appendChild(remarks);
    card.appendChild(summary);
    if (sourceMeta) {
      card.appendChild(sourceMeta);
    }
    if (timeMeta) {
      card.appendChild(timeMeta);
    }

    const openDetail = () => openCmsHistoryDetail(item);
    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail();
      }
    });
    cmsHistoryListEl.appendChild(card);
  }
}

async function loadCmsHistory() {
  try {
    const response = await window.api.cmsListHistory();
    if (!response.ok) {
      renderCmsHistoryPlaceholder(response.message || "加载历史失败。");
      return;
    }
    cmsState.history = Array.isArray(response.history) ? response.history : [];
    renderCmsHistory();
  } catch (error) {
    renderCmsHistoryPlaceholder(`加载历史异常：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function recordCmsHistory(detail) {
  if (!detail || !detail.id) {
    return;
  }
  try {
    const response = await window.api.cmsRecordHistory(detail);
    if (!response.ok) {
      appendCmsConsole("记录历史失败", response);
      return;
    }
    cmsState.history = Array.isArray(response.history) ? response.history : [];
    renderCmsHistory();
  } catch (error) {
    appendCmsConsole("记录历史异常", error instanceof Error ? error.message : String(error));
  }
}

function getEpisodeItems(detail) {
  if (!detail || !Array.isArray(detail.playSources)) {
    return [];
  }
  return detail.playSources.flatMap((source) => source.episodes.map((episode) => ({
    key: `${episode.name}$${episode.url}`,
    name: episode.name,
    url: episode.url,
    sourceUrl: episode.sourceUrl
  })));
}

function getCmsSourceDisplayName() {
  return cmsDetailState.source?.name || getSelectedCmsSource()?.name || "";
}

function getCmsDownloadGroupKeyFromName(name) {
  const text = String(name || "未命名影片").trim() || "未命名影片";
  const index = text.lastIndexOf("_");
  return index > 0 ? text.slice(0, index) : text;
}

function getCmsDownloadGroupKeyFromTask(task) {
  return task.groupKey || task.showName || getCmsDownloadGroupKeyFromName(task.name);
}

function getCmsDetailDownloadKey(detail) {
  const sourceId = String(detail && detail.sourceId || "").trim();
  const detailId = String(detail && detail.id || "").trim();
  if (sourceId && detailId) {
    return `${sourceId}:${detailId}`;
  }
  return String(detail && detail.name || "未命名影片").trim() || "未命名影片";
}

function getCmsDetailDownloadGroupKeys(detail) {
  const keys = new Set();
  const defaultName = String(detail && detail.name || "未命名影片").trim() || "未命名影片";
  keys.add(defaultName);
  const mappedKey = cmsDetailDownloadGroupKeys[getCmsDetailDownloadKey(detail)];
  if (mappedKey) {
    keys.add(mappedKey);
  }
  return keys;
}

function closeCmsDownloadNameModal() {
  cmsDownloadNameModal.classList.add("hidden");
  cmsPendingDownloadDetail = null;
  cmsPendingDownloadEpisodes = [];
  cmsDownloadShowNameInput.value = "";
  cmsDownloadNameStatusEl.textContent = "";
  confirmCmsDownloadNameBtn.disabled = false;
}

function openCmsDownloadNameModal(detail, episodes) {
  cmsPendingDownloadDetail = detail;
  cmsPendingDownloadEpisodes = episodes;
  cmsDownloadShowNameInput.value = detail.name || "未命名影片";
  cmsDownloadNameStatusEl.textContent = `将加入 ${episodes.length} 个剧集。`;
  cmsDownloadNameModal.classList.remove("hidden");
  cmsDownloadShowNameInput.focus();
  cmsDownloadShowNameInput.select();
}

async function confirmCmsDownloadName() {
  const detail = cmsPendingDownloadDetail;
  const selectedEpisodes = cmsPendingDownloadEpisodes;
  if (!detail || !selectedEpisodes.length) {
    closeCmsDownloadNameModal();
    setCmsDetailStatus("请至少勾选一个剧集。");
    return;
  }

  const showName = cmsDownloadShowNameInput.value.trim();
  if (!showName) {
    cmsDownloadNameStatusEl.textContent = "请输入电视剧名称。";
    cmsDownloadShowNameInput.focus();
    return;
  }

  confirmCmsDownloadNameBtn.disabled = true;
  cmsDownloadNameStatusEl.textContent = "正在加入下载队列...";
  try {
    const config = await window.api.getConfig();
    const response = await window.api.startTasks({
      exePath: config.exePath,
      tempRoot: config.tempRoot,
      finalRoot: config.defaultFinalRoot,
      showName,
      pageId: "cms",
      removeAds: config.removeAds,
      useSystemProxy: config.useSystemProxy,
      adSegmentThreshold: config.adSegmentThreshold,
      adDurationSequence: config.adDurationSequence,
      items: selectedEpisodes.map((episode) => ({
        episodeTitle: episode.name,
        url: episode.url
      }))
    });
    if (!response.ok) {
      cmsDownloadNameStatusEl.textContent = response.message || "加入下载队列失败";
      setCmsDetailStatus(response.message || "加入下载队列失败");
      appendCmsConsole("CMS 加入下载队列失败", response);
      confirmCmsDownloadNameBtn.disabled = false;
      return;
    }
    cmsLastDetailDownloadGroupKey = showName;
    cmsDetailDownloadGroupKeys[getCmsDetailDownloadKey(detail)] = showName;
    cmsDownloadActiveGroupKey = showName;
    setCmsDetailStatus(`已加入下载队列：${showName}，${selectedEpisodes.length} 个剧集`);
    cmsDownloadLogEl.textContent += `已加入下载队列：${showName}，共 ${selectedEpisodes.length} 个剧集。\n`;
    cmsDownloadLogEl.scrollTop = cmsDownloadLogEl.scrollHeight;
    closeCmsDownloadNameModal();
    updateCmsDownloadSummary();
    renderCmsDetail(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cmsDownloadNameStatusEl.textContent = `加入下载队列异常：${message}`;
    setCmsDetailStatus(`加入下载队列异常：${message}`);
    appendCmsConsole("CMS 加入下载队列异常", message);
    confirmCmsDownloadNameBtn.disabled = false;
  }
}

function getCmsDownloadCounts(entries) {
  return entries.reduce((summary, [, task]) => {
    const status = task.status || "queued";
    summary.total += 1;
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, { total: 0 });
}

function formatCmsDownloadCounts(counts) {
  return `共 ${counts.total || 0} 个任务，队列中 ${counts.queued || 0}，进行中 ${counts.running || 0}，完成 ${counts.done || 0}，失败 ${counts.error || 0}，取消 ${counts.cancelled || 0}`;
}

function buildEpisodeCopyText(episodes) {
  return episodes
    .map((episode) => `${episode.name}$${episode.url}`)
    .join("\n");
}

async function copyEpisodesToClipboard(detail = cmsDetailState.item) {
  const episodes = getEpisodeItems(detail);
  if (!episodes.length) {
    setCmsDetailStatus("暂无可复制链接。");
    return;
  }

  const text = buildEpisodeCopyText(episodes);
  try {
    await navigator.clipboard.writeText(text);
    setCmsDetailStatus(`已复制 ${episodes.length} 条链接。`);
  } catch (error) {
    setCmsDetailStatus(`复制失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function ensureCmsEpisodeSelection(detail) {
  const episodes = getEpisodeItems(detail);
  const nextSelection = {};
  for (const episode of episodes) {
    nextSelection[episode.key] = cmsDetailState.episodeSelection[episode.key] !== false;
  }
  cmsDetailState.episodeSelection = nextSelection;
}

function getEpisodeM3u8Url(episode) {
  return String(episode && episode.url || "").trim();
}

function getEpisodeSourceUrl(episode) {
  return String(episode && episode.sourceUrl || episode && episode.url || "").trim();
}

function destroyCmsHlsPlayer() {
  if (cmsHlsPlayer) {
    cmsHlsPlayer.destroy();
    cmsHlsPlayer = null;
  }
}

function closeCmsPlayerModal() {
  const video = document.getElementById("cmsPlayer");
  destroyCmsHlsPlayer();
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  cmsPlayerModal.classList.add("hidden");
  cmsPlayerStatusEl.textContent = "";
}

function playCmsM3u8(episode) {
  const url = getEpisodeM3u8Url(episode);
  if (!url) {
    setCmsDetailStatus("暂无 m3u8 播放地址。 ");
    return;
  }

  const video = document.getElementById("cmsPlayer");
  if (!video) {
    setCmsDetailStatus("播放器未初始化。");
    return;
  }

  cmsPlayerTitleEl.textContent = `播放 m3u8：${episode.name || "未命名剧集"}`;
  cmsPlayerStatusEl.textContent = "正在加载 m3u8...";
  cmsPlayerModal.classList.remove("hidden");
  destroyCmsHlsPlayer();
  video.pause();
  video.removeAttribute("src");
  video.load();

  const play = () => video.play().catch((error) => {
    const message = `播放失败：${error instanceof Error ? error.message : String(error)}`;
    cmsPlayerStatusEl.textContent = message;
    setCmsDetailStatus(message);
  });

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    play();
    cmsPlayerStatusEl.textContent = `正在播放：${episode.name || "未命名剧集"}`;
    setCmsDetailStatus(`正在播放：${episode.name || "未命名剧集"}`);
    return;
  }

  if (window.Hls && window.Hls.isSupported()) {
    cmsHlsPlayer = new window.Hls();
    cmsHlsPlayer.loadSource(url);
    cmsHlsPlayer.attachMedia(video);
    cmsHlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, () => {
      play();
      cmsPlayerStatusEl.textContent = `正在播放：${episode.name || "未命名剧集"}`;
      setCmsDetailStatus(`正在播放：${episode.name || "未命名剧集"}`);
    });
    cmsHlsPlayer.on(window.Hls.Events.ERROR, (event, data) => {
      if (data && data.fatal) {
        const message = `HLS 播放失败：${data.type || "未知错误"}`;
        cmsPlayerStatusEl.textContent = message;
        setCmsDetailStatus(message);
      }
    });
    return;
  }

  video.src = url;
  play();
  cmsPlayerStatusEl.textContent = "当前环境不支持 hls.js，已尝试直接播放 m3u8。";
  setCmsDetailStatus("当前环境不支持 hls.js，已尝试直接播放 m3u8。");
}

function openEpisodeSourceLink(episode) {
  const url = getEpisodeSourceUrl(episode);
  if (!url) {
    setCmsDetailStatus("暂无原站播放地址。");
    return;
  }
  console.log('source url', url)
  window.open(url, "_blank", "noopener,noreferrer");
}

function getSelectedCmsEpisodes(detail = cmsDetailState.item) {
  return getEpisodeItems(detail).filter((episode) => cmsDetailState.episodeSelection[episode.key] !== false);
}

function toggleAllCmsEpisodes(checked) {
  for (const episode of getEpisodeItems(cmsDetailState.item)) {
    cmsDetailState.episodeSelection[episode.key] = checked;
  }
  renderCmsDetail(cmsDetailState.item);
}

function createCmsDownloadTaskRow(id, task, { compact = false } = {}) {
  const row = document.createElement("div");
  row.className = `task ${task.status || "queued"}`;

  const name = document.createElement("div");
  name.className = "task-name";
  name.textContent = task.name || id;

  const status = document.createElement("div");
  status.className = "task-status";
  status.textContent = String(task.status || "queued").toUpperCase();

  const message = document.createElement("div");
  message.className = "task-message";
  message.textContent = task.message || "";

  const actions = document.createElement("div");
  actions.className = "task-actions";
  if (["queued", "running"].includes(task.status || "queued")) {
    const stopBtn = document.createElement("button");
    stopBtn.className = "btn small danger";
    stopBtn.type = "button";
    stopBtn.textContent = task.status === "running" ? "停止当前" : "移出队列";
    stopBtn.addEventListener("click", async () => {
      await window.api.removeTask(id);
      cmsDownloadLogEl.textContent += `已请求停止：${task.name || id}\n`;
      cmsDownloadLogEl.scrollTop = cmsDownloadLogEl.scrollHeight;
    });
    actions.appendChild(stopBtn);
  }

  if (compact) {
    row.textContent = `${task.name || id} [${String(task.status || "queued").toUpperCase()}] ${task.message || ""}`.trim();
    return row;
  }

  row.appendChild(name);
  row.appendChild(status);
  row.appendChild(message);
  row.appendChild(actions);
  return row;
}

function getCmsDownloadGroups() {
  const groups = new Map();
  for (const [id, task] of Object.entries(cmsDownloadTaskState)) {
    const key = getCmsDownloadGroupKeyFromTask(task);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push([id, task]);
  }
  return groups;
}

function renderCmsDownloadTabs(groups, selectedEntries) {
  const tabs = document.createElement("div");
  tabs.className = "cms-download-tabs";

  const allEntries = Object.entries(cmsDownloadTaskState);
  const allBtn = document.createElement("button");
  allBtn.className = `btn small${cmsDownloadActiveGroupKey === "__all__" ? " active" : ""}`;
  allBtn.type = "button";
  allBtn.textContent = `全部（${allEntries.length}）`;
  allBtn.addEventListener("click", () => {
    cmsDownloadActiveGroupKey = "__all__";
    updateCmsDownloadSummary();
  });
  tabs.appendChild(allBtn);

  for (const [groupKey, entries] of groups) {
    const btn = document.createElement("button");
    btn.className = `btn small${cmsDownloadActiveGroupKey === groupKey ? " active" : ""}`;
    btn.type = "button";
    btn.textContent = `${groupKey}（${entries.length}）`;
    btn.addEventListener("click", () => {
      cmsDownloadActiveGroupKey = groupKey;
      updateCmsDownloadSummary();
    });
    tabs.appendChild(btn);
  }

  const stopCurrentBtn = document.createElement("button");
  stopCurrentBtn.className = "btn small danger";
  stopCurrentBtn.type = "button";
  stopCurrentBtn.textContent = "停止当前分类任务";
  stopCurrentBtn.disabled = selectedEntries.length === 0;
  stopCurrentBtn.addEventListener("click", async () => {
    const cancellable = selectedEntries.filter(([, task]) => ["queued", "running"].includes(task.status || "queued"));
    for (const [id] of cancellable) {
      await window.api.removeTask(id);
    }
    cmsDownloadLogEl.textContent += `已请求停止当前分类任务：${cmsDownloadActiveGroupKey === "__all__" ? "全部" : cmsDownloadActiveGroupKey}，${cancellable.length} 个。\n`;
    cmsDownloadLogEl.scrollTop = cmsDownloadLogEl.scrollHeight;
  });
  tabs.appendChild(stopCurrentBtn);
  return tabs;
}

function updateCmsDownloadSummary() {
  const entries = Object.entries(cmsDownloadTaskState);
  if (!entries.length) {
    cmsDownloadSummaryEl.textContent = "总计：暂无 CMS 下载任务。";
    if (cmsDownloadMiniListEl) {
      cmsDownloadMiniListEl.textContent = "暂无任务";
    }
    cmsDownloadTaskListEl.textContent = "暂无任务";
    return;
  }

  const groups = getCmsDownloadGroups();
  if (cmsDownloadActiveGroupKey !== "__all__" && !groups.has(cmsDownloadActiveGroupKey)) {
    cmsDownloadActiveGroupKey = "__all__";
  }
  const selectedEntriesRaw = cmsDownloadActiveGroupKey === "__all__" ? entries : groups.get(cmsDownloadActiveGroupKey) || [];
  const selectedEntries = selectedEntriesRaw.slice().reverse();
  const totalCounts = getCmsDownloadCounts(entries);
  const selectedCounts = getCmsDownloadCounts(selectedEntriesRaw);
  const selectedLabel = cmsDownloadActiveGroupKey === "__all__" ? "全部" : cmsDownloadActiveGroupKey;
  cmsDownloadSummaryEl.innerHTML = `总计：${formatCmsDownloadCounts(totalCounts)}；<br/>当前分类「${selectedLabel}」：${formatCmsDownloadCounts(selectedCounts)}`;

  if (cmsDownloadMiniListEl) {
    cmsDownloadMiniListEl.innerHTML = "";
  }
  cmsDownloadTaskListEl.innerHTML = "";
  cmsDownloadTaskListEl.appendChild(renderCmsDownloadTabs(groups, selectedEntries));
  for (const [id, task] of selectedEntries) {
    if (cmsDownloadMiniListEl) {
      cmsDownloadMiniListEl.appendChild(createCmsDownloadTaskRow(id, task, { compact: true }));
    }
    cmsDownloadTaskListEl.appendChild(createCmsDownloadTaskRow(id, task));
  }
}

function renderCmsDetailDownloadInfo(detail) {
  const wrap = document.createElement("div");
  wrap.className = "cms-detail-download-info";
  const title = document.createElement("h4");
  title.textContent = "下载信息";
  wrap.appendChild(title);

  const groupKeys = getCmsDetailDownloadGroupKeys(detail);
  const entries = Object.entries(cmsDownloadTaskState).filter(([, task]) => groupKeys.has(getCmsDownloadGroupKeyFromTask(task)));
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "cms-placeholder";
    empty.textContent = "当前详情暂无下载任务。";
    wrap.appendChild(empty);
    return wrap;
  }

  const summary = document.createElement("p");
  summary.className = "status";
  summary.textContent = formatCmsDownloadCounts(getCmsDownloadCounts(entries));
  wrap.appendChild(summary);
  const list = document.createElement("div");
  list.className = "task-list";
  entries.slice().reverse().forEach(([id, task]) => list.appendChild(createCmsDownloadTaskRow(id, task)));
  wrap.appendChild(list);
  return wrap;
}

function renderCmsDetail(detail) {
  cmsDetailBodyEl.innerHTML = "";
  if (!detail) {
    cmsDetailBodyEl.textContent = "暂无详情数据。";
    return;
  }

  ensureCmsEpisodeSelection(detail);
  const layout = document.createElement("div");
  layout.className = "cms-detail-body";

  const aside = document.createElement("div");
  aside.className = "cms-detail-aside";
  if (detail.pic) {
    const cover = document.createElement("img");
    cover.className = "cms-detail-cover";
    cover.src = detail.pic;
    cover.alt = detail.name || "影片封面";
    aside.appendChild(cover);
  }
  layout.appendChild(aside);

  const main = document.createElement("div");
  main.className = "cms-detail-main";

  const title = document.createElement("h3");
  title.textContent = detail.name || "未命名影片";
  main.appendChild(title);

  const tags = document.createElement("div");
  tags.className = "cms-detail-tags";
  [detail.type, detail.year, detail.area, detail.lang, detail.score, detail.total, detail.serial].filter(Boolean).forEach((text) => {
    const tag = document.createElement("span");
    tag.className = "cms-detail-tag";
    tag.textContent = text;
    tags.appendChild(tag);
  });
  if (tags.childElementCount > 0) {
    main.appendChild(tags);
  }

  const metaList = document.createElement("div");
  metaList.className = "cms-detail-meta-list";
  [
    ["演员", detail.actor],
    ["导演", detail.director],
    ["更新时间", detail.updateTime],
    ["来源", `${getCmsSourceDisplayName()}${detail.id ? ` · ${detail.id}` : ""}`.trim()]
  ].forEach(([label, value]) => {
    const text = String(value || "").trim();
    if (!text) {
      return;
    }
    const item = document.createElement("div");
    item.className = "cms-detail-meta-item";
    item.textContent = `${label}：${text}`;
    metaList.appendChild(item);
  });
  if (metaList.childElementCount > 0) {
    main.appendChild(metaList);
  }

  const contentSection = document.createElement("section");
  contentSection.className = "cms-detail-section";
  const contentTitle = document.createElement("h4");
  contentTitle.textContent = "简介";
  const contentBody = document.createElement("div");
  contentBody.className = "cms-detail-content";
  const rawContent = String(detail.content || "").trim();
  const normalizedContent = rawContent
    ? rawContent
      .replace(/<br\s*\/?>(\s*)/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&ldquo;/gi, "“")
      .replace(/&rdquo;/gi, "”")
      .replace(/&lsquo;/gi, "‘")
      .replace(/&rsquo;/gi, "’")
      .replace(/&mdash;/gi, "—")
      .replace(/&hellip;/gi, "…")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    : "";
  const contentParagraphs = (normalizedContent || "暂无简介。")
    .split(/\n{2,}|(?<=。)\s*(?=\S)/)
    .map((line) => line.trim())
    .filter(Boolean);
  contentParagraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.className = "cms-detail-paragraph";
    p.textContent = paragraph;
    contentBody.appendChild(p);
  });
  contentSection.appendChild(contentTitle);
  contentSection.appendChild(contentBody);
  main.appendChild(contentSection);

  const episodes = getEpisodeItems(detail);
  const episodeSection = document.createElement("section");
  episodeSection.className = "cms-detail-section cms-detail-episode-section";

  const episodeTitle = document.createElement("h4");
  episodeTitle.textContent = `播放列表（已选 ${getSelectedCmsEpisodes(detail).length}/${episodes.length}）`;

  const toolbar = document.createElement("div");
  toolbar.className = "cms-detail-play-toolbar";
  const selectAllBtn = document.createElement("button");
  selectAllBtn.className = "btn small";
  selectAllBtn.textContent = "全选";
  selectAllBtn.addEventListener("click", () => toggleAllCmsEpisodes(true));
  const unselectAllBtn = document.createElement("button");
  unselectAllBtn.className = "btn small";
  unselectAllBtn.textContent = "全不选";
  unselectAllBtn.addEventListener("click", () => toggleAllCmsEpisodes(false));
  const copyM3u8Btn = document.createElement("button");
  copyM3u8Btn.className = "btn small primary cms-detail-copy-btn";
  copyM3u8Btn.type = "button";
  copyM3u8Btn.textContent = "复制 m3u8 链接";
  copyM3u8Btn.addEventListener("click", () => copyEpisodesToClipboard(detail));
  const queueBtn = document.createElement("button");
  queueBtn.className = "btn small primary";
  queueBtn.textContent = "加入下载队列";
  queueBtn.addEventListener("click", () => {
    const selectedEpisodes = getSelectedCmsEpisodes(detail);
    if (!selectedEpisodes.length) {
      setCmsDetailStatus("请至少勾选一个剧集。");
      return;
    }
    openCmsDownloadNameModal(detail, selectedEpisodes);
  });
  toolbar.appendChild(selectAllBtn);
  toolbar.appendChild(unselectAllBtn);
  toolbar.appendChild(copyM3u8Btn);
  toolbar.appendChild(queueBtn);

  const episodeList = document.createElement("div");
  episodeList.className = "cms-detail-episode-list";
  console.log(episodes)
  episodes.forEach((episode) => {
    const label = document.createElement("label");
    label.className = "cms-detail-episode";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = cmsDetailState.episodeSelection[episode.key] !== false;
    checkbox.addEventListener("change", () => {
      cmsDetailState.episodeSelection[episode.key] = checkbox.checked;
      episodeTitle.textContent = `播放列表（已选 ${getSelectedCmsEpisodes(detail).length}/${episodes.length}）`;
    });

    const text = document.createElement("span");
    text.textContent = `${episode.name}`;

    const urlLink = document.createElement("a");
    urlLink.className = "cms-detail-episode-url";
    urlLink.href = episode.url;
    urlLink.target = "_blank";
    urlLink.rel = "noreferrer";
    urlLink.textContent = episode.url;

    const playActions = document.createElement("div");
    playActions.className = "cms-detail-episode-actions";

    const playM3u8Btn = document.createElement("button");
    playM3u8Btn.className = "btn small primary cms-detail-play-btn";
    playM3u8Btn.type = "button";
    playM3u8Btn.textContent = "播放 m3u8";
    playM3u8Btn.addEventListener("click", (event) => {
      event.preventDefault();
      playCmsM3u8(episode);
    });

    const playSourceBtn = document.createElement("button");
    playSourceBtn.className = "btn small cms-detail-play-btn";
    playSourceBtn.type = "button";
    playSourceBtn.textContent = "原站播放";
    playSourceBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openEpisodeSourceLink(episode);
    });

    playActions.appendChild(playM3u8Btn);
    playActions.appendChild(playSourceBtn);

    const meta = document.createElement("div");
    meta.className = "cms-detail-episode-meta";
    meta.appendChild(text);
    meta.appendChild(urlLink);

    label.appendChild(checkbox);
    label.appendChild(meta);
    label.appendChild(playActions);
    episodeList.appendChild(label);
  });

  episodeSection.appendChild(episodeTitle);
  episodeSection.appendChild(toolbar);
  episodeSection.appendChild(episodeList);
  layout.appendChild(main);
  layout.appendChild(episodeSection);
  layout.appendChild(renderCmsDetailDownloadInfo(detail));

  cmsDetailBodyEl.appendChild(layout);
}


async function loadCmsDetail(item) {
  const source = item && item.sourceId
    ? cmsState.sources.find((candidate) => candidate.id === item.sourceId) || null
    : getSelectedCmsSource();
  if (!source) {
    setCmsPanel("list");
    setCmsView("detail");
    setCmsDetailStatus("历史记录对应资源站不存在，请重新配置资源站。");
    cmsDetailBodyEl.innerHTML = '<div class="cms-placeholder">历史记录对应资源站不存在，请重新配置资源站。</div>';
    return;
  }
  const requestId = cmsDetailRequestId + 1;
  cmsDetailRequestId = requestId;
  cmsDetailState = { item: null, loading: true, source };
  setCmsView("detail");
  cmsPrevPageBtn.disabled = true;
  cmsNextPageBtn.disabled = true;
  setCmsDetailStatus(`正在加载《${item.name || "未命名影片"}》详情...`);
  cmsDetailBodyEl.innerHTML = '<div class="cms-placeholder">正在请求影片详情，请查看 CMS 控制台输出。</div>';
  appendCmsConsole("点击影片详情", item);

  try {
    const response = await window.api.cmsDetail({
      sourceId: source.id,
      id: item.id,
      typeId: item.typeId
    });
    appendCmsConsole("详情响应", {
      ok: response.ok,
      message: response.message,
      requestUrl: response.requestUrl,
      hasDetail: Boolean(response.detail)
    });
    appendCmsHttpResponseToConsole(response.response);
    if (requestId !== cmsDetailRequestId) {
      return;
    }
    if (!response.ok) {
      setCmsDetailStatus(response.message || "加载详情失败");
      cmsDetailBodyEl.innerHTML = `<div class="cms-placeholder">${response.message || "加载详情失败"}</div>`;
      return;
    }

    cmsDetailState = {
      item: { ...response.detail, sourceId: source.id },
      loading: false,
      source,
      episodeSelection: {},
      currentPlayingKey: "",
      currentPlayingLabel: "",
      currentPlayingUrl: "",
      playerError: ""
    };
    setCmsDetailStatus(`详情已加载：${response.detail.name || item.name || "未命名影片"}`);
    const detail = { ...response.detail, sourceId: source.id };
    cmsDetailState.item = detail;
    renderCmsDetail(detail);
    recordCmsHistory(detail);
  } catch (error) {
    if (requestId !== cmsDetailRequestId) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    appendCmsConsole("详情异常", message);
    setCmsDetailStatus(`详情异常：${message}`);
    cmsDetailBodyEl.innerHTML = `<div class="cms-placeholder">详情异常：${message}</div>`;
  }
}

function backToCmsList() {
  cmsDetailState = { item: null, loading: false, episodeSelection: {}, source: null };
  setCmsDetailStatus("");
  setCmsView("list");
  renderCmsPagination();
  if (Array.isArray(cmsSearchState.items) && cmsSearchState.items.length > 0) {
    renderCmsVideos(cmsSearchState.items);
    return;
  }
  renderCmsPlaceholder("返回列表后暂无影片数据，请重新搜索或切换分类。");
}

async function searchCmsVideos({ page = 1, keyword = cmsSearchInputEl.value.trim(), typeId = cmsSelectedCategory.typeId } = {}) {
  const source = getSelectedCmsSource();
  if (!source) {
    const message = "未选择资源站，请先在 CMS 设置中新增资源站。";
    setCmsStatus(message);
    appendCmsConsole(message);
    return;
  }
  if (source.enabled === false) {
    const message = `资源站已禁用：${source.name}`;
    setCmsStatus(message);
    appendCmsConsole(message, source);
    return;
  }

  const requestId = cmsSearchRequestId + 1;
  cmsSearchRequestId = requestId;
  const payload = {
    sourceId: source.id,
    keyword,
    page,
    typeId
  };
  setCmsPanel("list");
  setCmsDetailStatus("");
  setCmsView("list");
  cmsVideoGridEl.classList.remove("hidden");
  setCmsStatus("正在发送 CMS 搜索请求...");
  cmsSearchBtn.disabled = true;
  renderCmsPlaceholder("正在请求 CMS 影片列表，请查看 CMS 控制台输出。");
  const requestUrl = buildCmsSearchRequestUrl(source, payload);
  appendCmsConsole("点击搜索", {
    sourceId: payload.sourceId,
    sourceName: source.name,
    requestUrl,
    requestParams: {
      ac: "videolist",
      pg: payload.page,
      ...(payload.keyword ? { wd: payload.keyword } : {}),
      ...(Number.parseInt(payload.typeId, 10) > 0 ? { t: Number.parseInt(payload.typeId, 10) } : {})
    }
  });

  try {
    const response = await window.api.cmsSearch(payload);
    appendCmsConsole("请求信息", {
      requestUrl: response.requestUrl || requestUrl,
      requestParams: {
        ac: "videolist",
        pg: payload.page,
        ...(payload.keyword ? { wd: payload.keyword } : {}),
        ...(Number.parseInt(payload.typeId, 10) > 0 ? { t: Number.parseInt(payload.typeId, 10) } : {})
      }
    });
    appendCmsConsole("搜索响应摘要", {
      ok: response.ok,
      message: response.message,
      requestUrl: response.requestUrl,
      page: response.page,
      pageCount: response.pageCount,
      total: response.total,
      itemCount: Array.isArray(response.items) ? response.items.length : 0
    });
    appendCmsHttpResponseToConsole(response.response);
    if (requestId !== cmsSearchRequestId) {
      appendCmsConsole("忽略过期搜索响应", { requestId });
      return;
    }
    if (!response.ok) {
      setCmsStatus(response.message || "搜索失败");
      renderCmsPlaceholder(response.message || "搜索失败，请查看控制台输出。");
      return;
    }

    cmsSearchState = {
      keyword,
      page: response.page || page,
      pageCount: response.pageCount || 1,
      total: response.total || 0,
      items: Array.isArray(response.items) ? response.items : []
    };
    setCmsStatus(`搜索完成：${getSelectedCmsCategoryLabel()}，共 ${cmsSearchState.total} 条。`);
    renderCmsVideos(cmsSearchState.items);
  } catch (error) {
    if (requestId !== cmsSearchRequestId) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    appendCmsConsole("搜索异常", message);
    setCmsStatus(`搜索异常：${message}`);
    renderCmsPlaceholder(`搜索异常：${message}`);
  } finally {
    if (requestId === cmsSearchRequestId) {
      cmsSearchBtn.disabled = false;
    }
  }
}

function renderCmsCategories(categoryTree) {
  cmsCategoryRowEl.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.className = `btn small${cmsSelectedCategory.typeId === 0 ? " active" : ""}`;
  allButton.textContent = "全部";
  allButton.addEventListener("click", () => {
    setCmsCategorySelection({ typeId: 0, typeName: "全部", parentTypeId: 0, parentTypeName: "" });
    renderCmsCategories(categoryTree);
    searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim(), typeId: 0 });
  });
  cmsCategoryRowEl.appendChild(allButton);

  for (const root of categoryTree) {
    const wrapper = document.createElement("div");
    wrapper.className = "cms-category-group";

    const parentButton = document.createElement("button");
    parentButton.className = `btn small cms-category-parent${cmsSelectedCategory.typeId === root.typeId || cmsSelectedCategory.parentTypeId === root.typeId ? " active" : ""}`;
    parentButton.textContent = getCategoryDisplayLabel(root);
    parentButton.addEventListener("click", () => {
      setCmsCategorySelection({
        typeId: root.typeId,
        typeName: root.typeName,
        parentTypeId: 0,
        parentTypeName: ""
      });
      renderCmsCategories(categoryTree);
      searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim(), typeId: root.typeId });
    });

    wrapper.appendChild(parentButton);

    if (flattenCmsCategoryChildren(root).length > 0) {
      const submenu = document.createElement("div");
      submenu.className = "cms-category-submenu";
      for (const child of root.children) {
        const childButton = document.createElement("button");
        childButton.className = `btn small cms-category-child${cmsSelectedCategory.typeId === child.typeId ? " active" : ""}`;
        childButton.textContent = getCategoryDisplayLabel(child);
        childButton.addEventListener("click", () => {
          setCmsCategorySelection({
            typeId: child.typeId,
            typeName: child.typeName,
            parentTypeId: root.typeId,
            parentTypeName: root.typeName
          });
          renderCmsCategories(categoryTree);
          searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim(), typeId: child.typeId });
        });
        submenu.appendChild(childButton);
      }
      wrapper.appendChild(submenu);
    }

    cmsCategoryRowEl.appendChild(wrapper);
  }
}

async function loadCmsCategories() {
  const source = getSelectedCmsSource();
  if (!source) {
    cmsCategoryTree = [];
    renderCmsCategories(cmsCategoryTree);
    return;
  }
  if (source.enabled === false) {
    cmsCategoryTree = [];
    renderCmsCategories(cmsCategoryTree);
    return;
  }

  const requestId = cmsCategoriesRequestId + 1;
  cmsCategoriesRequestId = requestId;
  const requestUrl = buildCmsCategoryRequestUrl(source);
  if (!requestUrl) {
    renderCmsCategories([]);
    return;
  }

  appendCmsConsole("加载分类", { sourceId: source.id, sourceName: source.name, requestUrl });
  const response = await window.api.cmsListCategories({ sourceId: source.id });
  appendCmsConsole("分类响应", {
    ok: response.ok,
    requestUrl: response.requestUrl,
    categoryCount: Array.isArray(response.categories) ? response.categories.length : 0
  });
  appendCmsHttpResponseToConsole(response.response);
  if (requestId !== cmsCategoriesRequestId) {
    return;
  }
  if (!response.ok) {
    setCmsStatus(response.message || "加载分类失败");
    renderCmsCategories([]);
    return;
  }

  cmsCategoryTree = Array.isArray(response.categories) ? response.categories : [];
  renderCmsCategories(cmsCategoryTree);
}

async function loadCmsSources() {
  const response = await window.api.cmsListSources();
  if (!response.ok) {
    setCmsStatus(response.message || "加载资源站失败");
    return;
  }
  cmsState = {
    ...cmsState,
    activeSourceId: response.activeSourceId || "",
    sources: response.sources || []
  };
  renderCmsSourceSelect();
  renderCmsSourceList();
  renderCmsPlaceholder();
  await loadCmsCategories();
  if (cmsState.sources.some((source) => source.enabled !== false)) {
    setCmsStatus("CMS 设置已加载，正在加载首页影片...");
    await searchCmsVideos({ page: 1, keyword: "", typeId: 0 });
    return;
  }
  setCmsStatus("请先在 CMS 设置中新增资源站。 ");
}

function setCmsPanel(panelName) {
  const panelIds = {
    list: "cmsListPanel",
    settings: "cmsSettingsPanel",
    history: "cmsHistoryPanel",
    downloads: "cmsDownloadsPanel"
  };
  for (const [name, panelId] of Object.entries(panelIds)) {
    document.getElementById(panelId).classList.toggle("hidden", name !== panelName);
  }
  if (panelName === "list") {
    setCmsView("list");
  } else {
    cmsListPanelEl.classList.add("hidden");
    cmsDetailPanelEl.classList.add("hidden");
  }
  document.querySelectorAll("[data-cms-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cmsPanel === panelName);
  });
  if (panelName === "history") {
    loadCmsHistory();
  }
}

document.querySelectorAll("[data-cms-panel]").forEach((button) => {
  button.addEventListener("click", () => setCmsPanel(button.dataset.cmsPanel));
});

cmsSourcePickerBtn.addEventListener("click", () => {
  toggleCmsSourcePicker();
});

cmsSourcePickerBtn.addEventListener("keydown", (event) => {
  if (["ArrowDown", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    openCmsSourcePicker();
    cmsSourcePickerMenuEl.querySelector(".cms-source-picker-option")?.focus();
  }
});

cmsSourcePickerMenuEl.addEventListener("keydown", (event) => {
  const options = Array.from(cmsSourcePickerMenuEl.querySelectorAll(".cms-source-picker-option"));
  const currentIndex = options.indexOf(document.activeElement);
  if (event.key === "Escape") {
    closeCmsSourcePicker();
    cmsSourcePickerBtn.focus();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + direction));
    options[nextIndex]?.focus();
  }
});

document.addEventListener("click", (event) => {
  if (!cmsSourcePickerEl.contains(event.target)) {
    closeCmsSourcePicker();
  }
});

saveCmsSourceBtn.addEventListener("click", async () => {
  const response = await window.api.cmsSaveSource(getEditingPayload());
  if (!response.ok) {
    setCmsSettingsStatus(response.message || "保存失败");
    return;
  }
  clearCmsSourceForm();
  await loadCmsSources();
  setCmsSettingsStatus("已保存资源站");
});

newCmsSourceBtn.addEventListener("click", () => clearCmsSourceForm());

testCmsSourceBtn.addEventListener("click", async () => {
  const payload = getEditingPayload();
  appendCmsConsole("测试资源站地址", payload);
  const response = await window.api.cmsTestSource(payload);
  appendCmsConsole("测试结果", response);
  setCmsSettingsStatus(response.message || (response.ok ? "测试通过" : "测试失败"));
});

clearCmsConsoleBtn.addEventListener("click", () => {
  cmsConsoleEl.textContent = "";
  cmsConsoleUnreadCount = 0;
  updateCmsConsoleBadge();
});

toggleCmsConsoleBtn.addEventListener("click", () => {
  toggleCmsConsole();
});

cmsSearchBtn.addEventListener("click", () => {
  searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim(), typeId: cmsSelectedCategory.typeId });
});

cmsBackToListBtn.addEventListener("click", () => {
  backToCmsList();
});

cmsSourceSelectEl.addEventListener("change", () => {
  const source = getSelectedCmsSource();
  appendCmsConsole("切换资源站", source || "未选择资源站");
  if (source && source.enabled !== false) {
    setCmsCategorySelection({ typeId: 0, typeName: "全部", parentTypeId: 0, parentTypeName: "" });
    loadCmsCategories();
    searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim(), typeId: 0 });
  }
});

cmsPrevPageBtn.addEventListener("click", () => {
  searchCmsVideos({ page: Math.max(1, cmsSearchState.page - 1), keyword: cmsSearchState.keyword, typeId: cmsSelectedCategory.typeId });
});

cmsNextPageBtn.addEventListener("click", () => {
  searchCmsVideos({ page: cmsSearchState.page + 1, keyword: cmsSearchState.keyword, typeId: cmsSelectedCategory.typeId });
});

cmsSearchInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    cmsSearchBtn.click();
  }
});

cmsDownloadQueueBtn.addEventListener("click", () => {
  cmsDownloadPopover?.classList.add("hidden");
  cmsDownloadModal.classList.add("hidden");
  setCmsPanel("downloads");
});
openCmsDownloadDetailBtn?.addEventListener("click", () => {
  cmsDownloadPopover?.classList.add("hidden");
  cmsDownloadModal.classList.add("hidden");
  setCmsPanel("downloads");
});
closeCmsDownloadModalBtn.addEventListener("click", () => {
  cmsDownloadModal.classList.add("hidden");
});
closeCmsDownloadNameModalBtn.addEventListener("click", () => closeCmsDownloadNameModal());
cancelCmsDownloadNameBtn.addEventListener("click", () => closeCmsDownloadNameModal());
confirmCmsDownloadNameBtn.addEventListener("click", () => confirmCmsDownloadName());
cmsDownloadShowNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    confirmCmsDownloadName();
  }
  if (event.key === "Escape") {
    closeCmsDownloadNameModal();
  }
});
cmsDownloadNameModal.addEventListener("click", (event) => {
  if (event.target === cmsDownloadNameModal) {
    closeCmsDownloadNameModal();
  }
});
closeCmsPlayerModalBtn.addEventListener("click", () => closeCmsPlayerModal());
cmsPlayerModal.addEventListener("click", (event) => {
  if (event.target === cmsPlayerModal) {
    closeCmsPlayerModal();
  }
});
cmsStopAllFromDetailBtn.addEventListener("click", async () => {
  await window.api.stopAll();
  cmsDownloadLogEl.textContent += "已请求停止所有下载任务。\n";
});

window.api.onTaskUpdate((event, payload) => {
  if (!payload || payload.pageId !== "cms") {
    return;
  }

  if (payload.status === "log") {
    cmsDownloadLogEl.textContent += `${payload.message || ""}`;
    cmsDownloadLogEl.scrollTop = cmsDownloadLogEl.scrollHeight;
    return;
  }

  const existing = cmsDownloadTaskState[payload.id] || {};
  const name = payload.name || existing.name || payload.id;
  cmsDownloadTaskState[payload.id] = {
    ...existing,
    ...payload,
    name,
    groupKey: existing.groupKey || getCmsDownloadGroupKeyFromName(name),
    message: payload.message !== undefined ? payload.message : existing.message || ""
  };
  updateCmsDownloadSummary();
  if (cmsDetailState.item) {
    renderCmsDetail(cmsDetailState.item);
  }
});

setCmsConsoleCollapsed(true);
updateCmsDownloadSummary();
loadCmsHistory();
loadCmsSources();

