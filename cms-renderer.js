const cmsStatusEl = document.getElementById("cmsStatus");
const cmsVideoGridEl = document.getElementById("cmsVideoGrid");
const cmsSourceSelectEl = document.getElementById("cmsSourceSelect");
const cmsPageInfoEl = document.getElementById("cmsPageInfo");
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

let cmsState = {
  activeSourceId: "",
  sources: [],
  editingSourceId: ""
};

function setCmsStatus(message) {
  cmsStatusEl.textContent = message || "";
}

function setCmsSettingsStatus(message) {
  cmsSettingsStatusEl.textContent = message || "";
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

function renderCmsPlaceholder() {
  cmsPageInfoEl.textContent = "占位";
  cmsVideoGridEl.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "cms-placeholder";
  placeholder.textContent = cmsState.sources.length > 0
    ? "后续阶段将在这里显示 CMS 影片列表。"
    : "请先在 CMS 设置中新增资源站。";
  cmsVideoGridEl.appendChild(placeholder);
  cmsDownloadSummaryEl.textContent = "暂无 CMS 下载任务。";
  cmsDownloadMiniListEl.textContent = "暂无任务";
  cmsDownloadTaskListEl.textContent = "暂无任务";
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
  setCmsStatus(cmsState.sources.length > 0 ? "CMS 设置已加载。" : "请先在 CMS 设置中新增资源站。 ");
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
  const response = await window.api.cmsTestSource(getEditingPayload());
  setCmsSettingsStatus(response.message || (response.ok ? "测试通过" : "测试失败"));
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

loadCmsSources();
