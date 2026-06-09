const http = require("http");
const https = require("https");

const CMS_REQUEST_TIMEOUT_MS = 10000;
const CMS_MAX_RESPONSE_BYTES = 1024 * 1024;

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

function toSafeString(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizePage(value, fallback = 1) {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) {
    return fallback;
  }
  return Math.min(page, 1000);
}

function buildCmsSearchUrl(apiUrl, { keyword, page, typeId }) {
  const url = new URL(apiUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 http/https 资源站地址。");
  }

  url.searchParams.set("ac", "videolist");
  url.searchParams.set("pg", String(page));
  const safeKeyword = String(keyword || "").trim();
  if (safeKeyword) {
    url.searchParams.set("wd", safeKeyword);
  } else {
    url.searchParams.delete("wd");
  }
  const safeTypeId = Number.parseInt(typeId, 10);
  if (Number.isFinite(safeTypeId) && safeTypeId > 0) {
    url.searchParams.set("t", String(safeTypeId));
  } else {
    url.searchParams.delete("t");
  }
  return url;
}

function buildCmsDetailUrl(apiUrl, { id, typeId }) {
  const url = new URL(apiUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 http/https 资源站地址。");
  }

  url.searchParams.set("ac", "detail");
  if (id) {
    url.searchParams.set("ids", String(id));
  }
  const safeTypeId = Number.parseInt(typeId, 10);
  if (Number.isFinite(safeTypeId) && safeTypeId > 0) {
    url.searchParams.set("t", String(safeTypeId));
  }
  return url;
}

function getResponseHeaderSummary(headers = {}) {
  const headerNames = ["content-type", "content-length", "server", "date", "location"];
  return headerNames.reduce((summary, name) => {
    if (headers[name]) {
      summary[name] = headers[name];
    }
    return summary;
  }, {});
}

function buildRawTextPreview(text) {
  const maxPreviewLength = 6000;
  return text.length > maxPreviewLength ? `${text.slice(0, maxPreviewLength)}\n... [truncated]` : text;
}

function buildJsonPreview(raw) {
  try {
    return JSON.stringify(raw, null, 2);
  } catch (error) {
    return "";
  }
}

function fetchCmsJson(url, source) {
  const client = url.protocol === "https:" ? https : http;
  const headers = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "User-Agent": source.userAgent || "N_m3u8DL-RE-Client CMS/1.0"
  };
  if (Array.isArray(source.cookies) && source.cookies.length > 0) {
    headers.Cookie = source.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const request = client.get(url, { headers }, (response) => {
      const responseMeta = {
        statusCode: response.statusCode || 0,
        contentType: String(response.headers["content-type"] || ""),
        headers: getResponseHeaderSummary(response.headers),
        bytes: 0,
        rawTextPreview: "",
        jsonPreview: ""
      };

      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        const error = new Error(`资源站返回重定向 HTTP ${response.statusCode}，已拒绝自动跳转。`);
        error.responseMeta = responseMeta;
        finishReject(error);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        const error = new Error(`资源站返回 HTTP ${response.statusCode}`);
        error.responseMeta = responseMeta;
        finishReject(error);
        return;
      }

      const chunks = [];
      let receivedBytes = 0;
      response.on("data", (chunk) => {
        if (settled) {
          return;
        }
        receivedBytes += chunk.length;
        responseMeta.bytes = receivedBytes;
        if (receivedBytes > CMS_MAX_RESPONSE_BYTES) {
          const error = new Error("资源站响应过大。");
          error.responseMeta = responseMeta;
          finishReject(error);
          response.destroy();
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) {
          return;
        }
        const text = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");
        responseMeta.rawTextPreview = buildRawTextPreview(text);
        try {
          const json = JSON.parse(text);
          responseMeta.jsonPreview = buildJsonPreview(json);
          finishResolve({
            raw: json,
            responseMeta
          });
        } catch (error) {
          const parseError = new Error("资源站返回非 JSON 响应。");
          parseError.responseMeta = responseMeta;
          finishReject(parseError);
        }
      });
    });

    request.setTimeout(CMS_REQUEST_TIMEOUT_MS, () => {
      const error = new Error("CMS 请求超时。");
      finishReject(error);
      request.destroy();
    });
    request.on("error", finishReject);
  });
}

function normalizeCmsVideo(item, sourceId) {
  return {
    id: toSafeString(item.vod_id || item.id, 64),
    name: toSafeString(item.vod_name || item.name, 120),
    typeId: Number.parseInt(item.type_id || item.typeId, 10) || 0,
    type: toSafeString(item.type_name || item.type, 60),
    year: toSafeString(item.vod_year || item.year, 20),
    area: toSafeString(item.vod_area || item.area, 60),
    lang: toSafeString(item.vod_lang || item.lang, 60),
    actor: toSafeString(item.vod_actor || item.actor, 200),
    director: toSafeString(item.vod_director || item.director, 120),
    remarks: toSafeString(item.vod_remarks || item.remarks, 120),
    pic: toSafeString(item.vod_pic || item.pic, 500),
    sourceId
  };
}

function parseVodPlaySources(value) {
  const sourceText = String(value || "").trim();
  if (!sourceText) {
    return [];
  }

  return sourceText
    .split("$$$")
    .map((group) => {
      const parts = String(group || "").split("$$");
      const sourceName = toSafeString(parts[0], 80) || "默认线路";
      const episodes = String(parts[1] || "")
        .split("#")
        .map((episode) => {
          const [name, url] = String(episode || "").split("$");
          const safeUrl = String(url || "").trim();
          if (!safeUrl) {
            return null;
          }
          return {
            name: toSafeString(name, 120) || safeUrl,
            url: safeUrl
          };
        })
        .filter(Boolean);

      if (!episodes.length) {
        return null;
      }

      return {
        sourceName,
        episodes
      };
    })
    .filter(Boolean);
}

function normalizeCmsVideoDetail(item, sourceId) {
  const base = normalizeCmsVideo(item, sourceId);
  return {
    ...base,
    content: toSafeString(item.vod_content || item.content, 5000),
    updateTime: toSafeString(item.vod_time || item.update_time || item.time, 40),
    score: toSafeString(item.vod_score || item.score, 20),
    total: toSafeString(item.vod_total || item.total, 20),
    serial: toSafeString(item.vod_serial || item.serial, 40),
    playFrom: toSafeString(item.vod_play_from, 500),
    playUrl: toSafeString(item.vod_play_url, 5000),
    playSources: parseVodPlaySources(item.vod_play_url)
  };
}

function normalizeCmsDetailResponse(raw, sourceId, videoId) {
  const list = Array.isArray(raw.list) ? raw.list : [];
  const detailItem = list.find((item) => String(item && (item.vod_id || item.id || "")) === String(videoId || "")) || list[0] || null;
  if (!detailItem) {
    return null;
  }
  return normalizeCmsVideoDetail(detailItem, sourceId);
}

function normalizeCategory(item) {
  const typeId = Number.parseInt(item.type_id, 10);
  const typePid = Number.parseInt(item.type_pid, 10);
  const typeName = toSafeString(item.type_name, 120);
  if (!Number.isFinite(typeId) || !typeName) {
    return null;
  }
  return {
    typeId,
    typePid: Number.isFinite(typePid) ? typePid : 0,
    typeName
  };
}

function buildCategoryTree(categories) {
  const map = new Map();
  for (const category of categories) {
    map.set(category.typeId, {
      ...category,
      children: []
    });
  }

  const roots = [];
  for (const category of map.values()) {
    if (category.typePid > 0 && map.has(category.typePid)) {
      map.get(category.typePid).children.push(category);
      continue;
    }
    roots.push(category);
  }

  roots.sort((left, right) => left.typeId - right.typeId);
  for (const root of roots) {
    root.children.sort((left, right) => left.typeId - right.typeId);
  }
  return roots;
}

function parseCategoryResponse(raw) {
  const categories = Array.isArray(raw.class) ? raw.class.map(normalizeCategory).filter(Boolean) : [];
  return buildCategoryTree(categories);
}

function normalizeCmsSearchResponse(raw, sourceId) {
  const list = Array.isArray(raw.list) ? raw.list : [];
  const items = list
    .map((item) => normalizeCmsVideo(item || {}, sourceId))
    .filter((item) => item.id || item.name);

  return {
    page: normalizePage(raw.page, 1),
    pageCount: normalizePage(raw.pagecount || raw.pageCount, 1),
    total: Number.parseInt(raw.total, 10) || items.length,
    items
  };
}

function registerCmsIpc(ipcMain, store) {
  ipcMain.handle("cms:request", async () => ({ ok: false, placeholder: true, message: "CMS 占位 IPC 已可用，请使用 cms:search 执行影片搜索。" }));

  ipcMain.handle("cms:search", async (event, payload = {}) => {
    try {
      const cms = getCmsConfig(store.readConfig());
      const source = cms.sources.find((item) => item.id === payload.sourceId);
      if (!source) {
        return { ok: false, message: "未找到选中的资源站，请重新选择。" };
      }
      if (source.enabled === false) {
        return { ok: false, message: `资源站已禁用：${source.name}` };
      }

      const keyword = String(payload.keyword || "").trim();
      const page = normalizePage(payload.page, 1);
      const typeId = payload.typeId;
      const requestUrl = buildCmsSearchUrl(source.apiUrl, { keyword, page, typeId });
      const rawResponse = await fetchCmsJson(requestUrl, source);
      const normalized = normalizeCmsSearchResponse(rawResponse.raw, source.id);

      return {
        ok: true,
        sourceId: source.id,
        sourceName: source.name,
        requestUrl: requestUrl.toString(),
        response: rawResponse.responseMeta,
        ...normalized
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        response: error && error.responseMeta ? error.responseMeta : null
      };
    }
  });

  ipcMain.handle("cms:detail", async (event, payload = {}) => {
    try {
      const cms = getCmsConfig(store.readConfig());
      const source = cms.sources.find((item) => item.id === payload.sourceId);
      if (!source) {
        return { ok: false, message: "未找到选中的资源站，请重新选择。" };
      }
      if (source.enabled === false) {
        return { ok: false, message: `资源站已禁用：${source.name}` };
      }

      const videoId = String(payload.id || "").trim();
      if (!videoId) {
        return { ok: false, message: "缺少影片 ID。" };
      }
      const requestUrl = buildCmsDetailUrl(source.apiUrl, { id: videoId, typeId: payload.typeId });
      const rawResponse = await fetchCmsJson(requestUrl, source);
      const detail = normalizeCmsDetailResponse(rawResponse.raw, source.id, videoId);
      if (!detail) {
        return { ok: false, message: "未找到影片详情。", requestUrl: requestUrl.toString(), response: rawResponse.responseMeta };
      }

      return {
        ok: true,
        sourceId: source.id,
        sourceName: source.name,
        requestUrl: requestUrl.toString(),
        response: rawResponse.responseMeta,
        detail
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        response: error && error.responseMeta ? error.responseMeta : null
      };
    }
  });

  ipcMain.handle("cms:categories", async (event, payload = {}) => {
    try {
      const cms = getCmsConfig(store.readConfig());
      const source = cms.sources.find((item) => item.id === payload.sourceId);
      if (!source) {
        return { ok: false, message: "未找到选中的资源站，请重新选择。" };
      }
      if (source.enabled === false) {
        return { ok: false, message: `资源站已禁用：${source.name}` };
      }

      const requestUrl = new URL(source.apiUrl);
      requestUrl.searchParams.set("ac", "list");
      requestUrl.searchParams.set("pg", "1");
      const rawResponse = await fetchCmsJson(requestUrl, source);
      const categories = parseCategoryResponse(rawResponse.raw);
      return {
        ok: true,
        sourceId: source.id,
        sourceName: source.name,
        requestUrl: requestUrl.toString(),
        response: rawResponse.responseMeta,
        categories
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        response: error && error.responseMeta ? error.responseMeta : null
      };
    }
  });

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
