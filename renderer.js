const showNameInput = document.getElementById("showName");
const exePathInput = document.getElementById("exePath");
const tempRootInput = document.getElementById("tempRoot");
const finalRootInput = document.getElementById("finalRoot");
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

const taskState = new Map();
const batchSelection = new Map();

function setStatus(message) {
  statusEl.textContent = message || "";
}

function setBatchStatus(message) {
  batchStatusEl.textContent = message || "";
}

function appendLog(message) {
  logEl.textContent += message;
  logEl.scrollTop = logEl.scrollHeight;
}

function renderTasks() {
  taskList.innerHTML = "";
  for (const [id, task] of taskState.entries()) {
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

function renderBatchList(items) {
  batchList.innerHTML = "";
  for (const item of items) {
    const key = `${item.episodeTitle}$${item.url}`;
    const checked = batchSelection.get(key) !== false;

    const row = document.createElement("label");
    row.className = "batch-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => {
      batchSelection.set(key, checkbox.checked);
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
  const raw = batchInput.value;
  const { items, errors } = parseBatchInput(raw);
  if (errors.length) {
    setBatchStatus(errors[0]);
  } else {
    setBatchStatus("");
  }

  const nextKeys = new Set(items.map((item) => `${item.episodeTitle}$${item.url}`));
  for (const key of batchSelection.keys()) {
    if (!nextKeys.has(key)) {
      batchSelection.delete(key);
    }
  }
  for (const key of nextKeys) {
    if (!batchSelection.has(key)) {
      batchSelection.set(key, true);
    }
  }

  renderBatchList(items);
}

async function loadConfig() {
  const config = await window.api.getConfig();
  showNameInput.value = config.showName || "";
  exePathInput.value = config.exePath || "";
  tempRootInput.value = config.tempRoot || "";
  finalRootInput.value = config.finalRoot || "";
  batchInput.value = config.batchInput || "";
  refreshBatchPreview();
}

async function saveConfig() {
  const nextConfig = {
    showName: showNameInput.value.trim(),
    exePath: exePathInput.value.trim(),
    tempRoot: tempRootInput.value.trim(),
    finalRoot: finalRootInput.value.trim(),
    batchInput: batchInput.value
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
  logEl.textContent = "";

  const showName = showNameInput.value.trim();
  const exePath = exePathInput.value.trim();
  const tempRoot = tempRootInput.value.trim();
  const finalRoot = finalRootInput.value.trim();
  const raw = batchInput.value;

  const { items, errors } = parseBatchInput(raw);
  if (errors.length) {
    setStatus(errors[0]);
    return;
  }

  const selectedItems = items.filter((item) => {
    const key = `${item.episodeTitle}$${item.url}`;
    return batchSelection.get(key) !== false;
  });
  if (selectedItems.length === 0) {
    setStatus("请先选择要下载的集数");
    return;
  }

  const response = await window.api.startTasks({
    showName,
    exePath,
    tempRoot,
    finalRoot,
    items: selectedItems
  });

  if (!response.ok) {
    setStatus(response.message || "启动失败");
    return;
  }

  const previous = new Map(taskState);
  taskState.clear();
  for (const task of response.tasks) {
    const existing = previous.get(task.id);
    taskState.set(task.id, {
      name: task.saveName,
      status: existing?.status || "queued",
      message: existing?.message || ""
    });
  }
  renderTasks();
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

window.api.onTaskUpdate((event, payload) => {
  if (payload.status === "log") {
    appendLog(payload.message || "");
    return;
  }

  const task = taskState.get(payload.id) || { name: payload.name || payload.id };
  if (payload.status) {
    task.status = payload.status;
  }
  if (payload.message) {
    task.message = payload.message;
  }
  taskState.set(payload.id, task);
  renderTasks();
});

showNameInput.addEventListener("input", () => saveConfig());
exePathInput.addEventListener("input", () => saveConfig());
tempRootInput.addEventListener("input", () => saveConfig());
finalRootInput.addEventListener("input", () => saveConfig());
batchInput.addEventListener("input", () => {
  saveConfig();
  refreshBatchPreview();
});

loadConfig();
setActiveTab("main");

selectAllBtn.addEventListener("click", () => {
  for (const key of batchSelection.keys()) {
    batchSelection.set(key, true);
  }
  refreshBatchPreview();
});

selectNoneBtn.addEventListener("click", () => {
  for (const key of batchSelection.keys()) {
    batchSelection.set(key, false);
  }
  refreshBatchPreview();
});
