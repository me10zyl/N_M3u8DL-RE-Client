const cmsStatusEl = document.getElementById("cmsStatus");
const cmsVideoGridEl = document.getElementById("cmsVideoGrid");
const cmsSourceSelectEl = document.getElementById("cmsSourceSelect");
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
const cmsConsoleCardEl = document.getElementById("cmsConsoleCard");
const cmsConsoleEl = document.getElementById("cmsConsole");
const clearCmsConsoleBtn = document.getElementById("clearCmsConsole");
const toggleCmsConsoleBtn = document.getElementById("toggleCmsConsoleBtn");
const cmsConsoleBadgeEl = document.getElementById("cmsConsoleBadge");

let cmsState = {
  activeSourceId: "",
  sources: [],
  editingSourceId: ""
};
let cmsSearchRequestId = 0;
let cmsSearchState = {
  keyword: "",
  page: 1,
  pageCount: 1,
  total: 0,
  items: []
};
let isCmsConsoleCollapsed = true;
let cmsConsoleUnreadCount = 0;

function buildCmsSearchRequestUrl(source, { keyword, page }) {
  try {
    const url = new URL(source.apiUrl);
    url.searchParams.set("ac", "videolist");
    url.searchParams.set("pg", String(page));
    if (String(keyword || "").trim()) {
      url.searchParams.set("wd", String(keyword || "").trim());
    } else {
      url.searchParams.delete("wd");
    }
    return url.toString();
  } catch (error) {
    return "";
  }
}

function setCmsStatus(message) {
  cmsStatusEl.textContent = message || "";
}

function setCmsSettingsStatus(message) {
  cmsSettingsStatusEl.textContent = message || "";
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

function renderCmsSourceSelect() {
  cmsSourceSelectEl.innerHTML = "";
  if (cmsState.sources.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未配置资源站";
    cmsSourceSelectEl.appendChild(option);
    return;
  }

  for (const source of cmsState.sources) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.enabled === false ? `${source.name}（已禁用）` : source.name;
    option.selected = source.id === cmsState.activeSourceId;
    cmsSourceSelectEl.appendChild(option);
  }
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
  const placeholder = document.createElement("div");
  placeholder.className = "cms-placeholder";
  placeholder.textContent = message || (cmsState.sources.length > 0
    ? "正在等待 CMS 影片列表。"
    : "请先在 CMS 设置中新增资源站。");
  cmsVideoGridEl.appendChild(placeholder);
  cmsDownloadSummaryEl.textContent = "暂无 CMS 下载任务。";
  cmsDownloadMiniListEl.textContent = "暂无任务";
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

    const title = document.createElement("h3");
    title.textContent = item.name || "未命名影片";

    const remarks = document.createElement("div");
    remarks.className = "cms-video-remarks";
    remarks.textContent = item.remarks || "暂无更新信息";

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
    cmsVideoGridEl.appendChild(card);
  }
  renderCmsPagination();
}

async function searchCmsVideos({ page = 1, keyword = cmsSearchInputEl.value.trim() } = {}) {
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
    page
  };
  setCmsPanel("list");
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
      ...(payload.keyword ? { wd: payload.keyword } : {})
    }
  });

  try {
    const response = await window.api.cmsSearch(payload);
    appendCmsConsole("请求信息", {
      requestUrl: response.requestUrl || requestUrl,
      requestParams: {
        ac: "videolist",
        pg: payload.page,
        ...(payload.keyword ? { wd: payload.keyword } : {})
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
    setCmsStatus(`搜索完成：共 ${cmsSearchState.total} 条。`);
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
  if (cmsState.sources.some((source) => source.enabled !== false)) {
    setCmsStatus("CMS 设置已加载，正在加载首页影片...");
    await searchCmsVideos({ page: 1, keyword: "" });
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
  document.querySelectorAll("[data-cms-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cmsPanel === panelName);
  });
}

document.querySelectorAll("[data-cms-panel]").forEach((button) => {
  button.addEventListener("click", () => setCmsPanel(button.dataset.cmsPanel));
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
  searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim() });
});

cmsSourceSelectEl.addEventListener("change", () => {
  const source = getSelectedCmsSource();
  appendCmsConsole("切换资源站", source || "未选择资源站");
  if (source && source.enabled !== false) {
    searchCmsVideos({ page: 1, keyword: cmsSearchInputEl.value.trim() });
  }
});

cmsPrevPageBtn.addEventListener("click", () => {
  searchCmsVideos({ page: Math.max(1, cmsSearchState.page - 1), keyword: cmsSearchState.keyword });
});

cmsNextPageBtn.addEventListener("click", () => {
  searchCmsVideos({ page: cmsSearchState.page + 1, keyword: cmsSearchState.keyword });
});

cmsSearchInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    cmsSearchBtn.click();
  }
});

cmsDownloadQueueBtn.addEventListener("click", () => {
  cmsDownloadPopover.classList.toggle("hidden");
});
openCmsDownloadDetailBtn.addEventListener("click", () => {
  cmsDownloadPopover.classList.add("hidden");
  cmsDownloadModal.classList.remove("hidden");
});
closeCmsDownloadModalBtn.addEventListener("click", () => {
  cmsDownloadModal.classList.add("hidden");
});
cmsStopAllFromDetailBtn.addEventListener("click", async () => {
  await window.api.stopAll();
  cmsDownloadLogEl.textContent += "已请求停止所有下载任务。\n";
});

setCmsConsoleCollapsed(true);
loadCmsSources();
