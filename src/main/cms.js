function createId() {
  return `cms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeApiUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch (error) {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}

function normalizeSource(input = {}, existing = {}) {
  const apiUrl = normalizeApiUrl(input.apiUrl || input.url || input.baseUrl || existing.apiUrl);
  if (!apiUrl) {
    return null;
  }

  const name = String(input.name || existing.name || "").trim();
  if (!name) {
    return null;
  }

  return {
    id: existing.id || input.id || createId(),
    name,
    apiUrl,
    enabled: input.enabled !== false,
    userAgent: String(input.userAgent || existing.userAgent || ""),
    cookies: Array.isArray(input.cookies) ? input.cookies : Array.isArray(existing.cookies) ? existing.cookies : [],
    lastVerifiedAt: input.lastVerifiedAt || existing.lastVerifiedAt || "",
    verificationHint: input.verificationHint || existing.verificationHint || ""
  };
}

function getCmsConfig(config) {
  const cms = config.cms && typeof config.cms === "object" ? config.cms : {};
  return {
    activeSourceId: cms.activeSourceId || config.activeCmsSourceId || "",
    sources: Array.isArray(cms.sources) ? cms.sources : Array.isArray(config.cmsSources) ? config.cmsSources : [],
    history: Array.isArray(cms.history) ? cms.history : []
  };
}

function writeCmsConfig(store, cms) {
  const config = store.readConfig();
  store.writeConfig({
    ...config,
    cms,
    cmsSources: cms.sources,
    activeCmsSourceId: cms.activeSourceId
  });
}

function registerCmsIpc(ipcMain, store) {
  ipcMain.handle("cms:request", async () => ({ ok: false, placeholder: true, message: "CMS 占位 IPC 已可用，暂不执行完整 CMS 请求。" }));

  ipcMain.handle("cms:sources:list", () => {
    const cms = getCmsConfig(store.readConfig());
    return { ok: true, ...cms };
  });

  ipcMain.handle("cms:sources:save", (event, payload = {}) => {
    const config = store.readConfig();
    const cms = getCmsConfig(config);
    const existing = cms.sources.find((source) => source.id === payload.id) || {};
    const normalized = normalizeSource(payload, existing);
    if (!normalized) {
      return { ok: false, message: "请填写有效的资源站名称和 http/https 接口地址。" };
    }

    const sources = existing.id
      ? cms.sources.map((source) => source.id === existing.id ? normalized : source)
      : [...cms.sources, normalized];
    const activeSourceId = cms.activeSourceId || normalized.id;
    const nextCms = { ...cms, activeSourceId, sources };
    writeCmsConfig(store, nextCms);
    return { ok: true, source: normalized, cms: nextCms };
  });

  ipcMain.handle("cms:sources:delete", (event, id) => {
    const config = store.readConfig();
    const cms = getCmsConfig(config);
    const sources = cms.sources.filter((source) => source.id !== id);
    const activeSourceId = cms.activeSourceId === id ? (sources.find((source) => source.enabled !== false) || sources[0] || {}).id || "" : cms.activeSourceId;
    const nextCms = { ...cms, activeSourceId, sources };
    writeCmsConfig(store, nextCms);
    return { ok: true, cms: nextCms };
  });

  ipcMain.handle("cms:sources:test", (event, payload = {}) => {
    const normalized = normalizeSource(payload);
    if (!normalized) {
      return { ok: false, message: "请填写有效的资源站名称和 http/https 接口地址。" };
    }
    return { ok: true, message: "接口地址格式有效。完整连接测试将在 CMS 请求阶段接入。" };
  });
}

module.exports = { registerCmsIpc };
