const fs = require("fs");
const path = require("path");

function getConfigPath(app) {
  return path.join(app.getPath("userData"), "config.json");
}

function normalizeAdSegmentThreshold(value) {
  const threshold = Number.parseInt(value, 10);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
}

function createDefaultPage(parsed = {}) {
  return {
    id: "page-1",
    title: parsed.showName || "页面 1",
    showName: parsed.showName || "",
    finalRoot: parsed.finalRoot || parsed.defaultFinalRoot || "",
    batchInput: parsed.batchInput || ""
  };
}

function normalizePages(parsed = {}) {
  const pages = Array.isArray(parsed.pages) && parsed.pages.length > 0
    ? parsed.pages
    : [createDefaultPage(parsed)];

  return pages.map((page, index) => {
    const id = page.id || `page-${index + 1}`;
    const showName = page.showName || "";
    return {
      id,
      title: page.title || showName || `页面 ${index + 1}`,
      showName,
      finalRoot: page.finalRoot || "",
      batchInput: page.batchInput || ""
    };
  });
}

function createConfig(app, parsed = {}) {
  const resourcesRoot = process.resourcesPath || app.getAppPath();
  const bundledExe = path.join(resourcesRoot, "bin", "N_m3u8DL-RE.exe");
  const devExe = path.join(app.getAppPath(), "bin", "N_m3u8DL-RE.exe");
  const defaultTempRoot = path.join(resourcesRoot, "tmp");
  const defaultFinalRoot = parsed.defaultFinalRoot || parsed.finalRoot || path.join(resourcesRoot, "target");
  const exeCandidate = parsed.exePath || "";
  const resolvedExe = fs.existsSync(exeCandidate)
    ? exeCandidate
    : fs.existsSync(bundledExe)
    ? bundledExe
    : fs.existsSync(devExe)
    ? devExe
    : bundledExe;
  const pages = normalizePages({ ...parsed, defaultFinalRoot });
  const activePage = pages.find((page) => page.id === parsed.activePageId) || pages[0];
  const parsedCms = parsed.cms && typeof parsed.cms === "object" ? parsed.cms : {};
  const cmsSources = Array.isArray(parsedCms.sources)
    ? parsedCms.sources
    : Array.isArray(parsed.cmsSources)
    ? parsed.cmsSources
    : [];
  const activeCmsSourceId = parsedCms.activeSourceId || parsed.activeCmsSourceId || "";
  const cmsHistory = Array.isArray(parsedCms.history) ? parsedCms.history : [];

  return {
    exePath: resolvedExe,
    tempRoot: parsed.tempRoot || defaultTempRoot,
    defaultFinalRoot,
    removeAds: parsed.removeAds !== false,
    useSystemProxy: parsed.useSystemProxy === true,
    adSegmentThreshold: normalizeAdSegmentThreshold(parsed.adSegmentThreshold),
    adDurationSequence: parsed.adDurationSequence || "",
    adIndexSequence: parsed.adIndexSequence || "",
    showAdPreviewOnCmsDownload: parsed.showAdPreviewOnCmsDownload === true,
    adDebugUrl: parsed.adDebugUrl || "",
    adDebugThreshold: normalizeAdSegmentThreshold(parsed.adDebugThreshold || parsed.adSegmentThreshold),
    adDebugSearch: parsed.adDebugSearch || "",
    adDebugDurationSequence: parsed.adDebugDurationSequence || "",
    cms: {
      activeSourceId: activeCmsSourceId,
      sources: cmsSources,
      history: cmsHistory
    },
    cmsSources,
    activeCmsSourceId,
    activePageId: activePage.id,
    pages,
    showName: activePage.showName,
    finalRoot: activePage.finalRoot || defaultFinalRoot,
    batchInput: activePage.batchInput
  };
}

function createConfigStore(app) {
  function readConfig() {
    const configPath = getConfigPath(app);
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      return createConfig(app, JSON.parse(raw));
    } catch (error) {
      return createConfig(app);
    }
  }

  function writeConfig(nextConfig) {
    const config = createConfig(app, nextConfig || {});
    const configPath = getConfigPath(app);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return config;
  }

  return { readConfig, writeConfig };
}

function registerConfigIpc(ipcMain, store) {
  ipcMain.handle("config:get", () => store.readConfig());
  ipcMain.handle("config:set", (event, nextConfig) => {
    const currentConfig = store.readConfig();
    store.writeConfig({ ...currentConfig, ...(nextConfig || {}) });
    return true;
  });
}

module.exports = {
  createConfigStore,
  normalizeAdSegmentThreshold,
  registerConfigIpc
};
