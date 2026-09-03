"use strict";

const path = require("path");
const crypto = require("crypto");

function parseDurationSequence(value) {
  return String(value || "").split(/[\s,，]+/).map((item) => Number.parseFloat(item.trim())).filter(Number.isFinite);
}

function parseIndexSequence(value) {
  const result = [];
  const invalid = [];
  for (const rule of String(value || "").split(";")) {
    const text = rule.trim();
    if (!text) continue;
    for (const item of text.split(/[\s,，]+/)) {
      if (!item) continue;
      const range = item.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start > end) { invalid.push(item); continue; }
        for (let index = start; index <= end; index += 1) result.push(index);
        continue;
      }
      if (/^\d+$/.test(item)) result.push(Number(item));
      else invalid.push(item);
    }
  }
  return { indexes: [...new Set(result)].sort((a, b) => a - b), invalid };
}

function formatIndexSequence(indexes) {
  const values = [...new Set(indexes.map(Number).filter(Number.isInteger).filter((value) => value >= 0))].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = values[i];
    let end = start;
    while (values[i + 1] === end + 1) { end = values[++i]; }
    parts.push(start === end ? String(start) : `${start}-${end}`);
  }
  return parts.join(",");
}

function getSegmentFilename(url) {
  try { return path.basename(new URL(url).pathname); }
  catch { return path.basename(String(url || "").split(/[?#]/)[0]); }
}

function getSegmentHash(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("hash") || path.basename(parsed.pathname);
  } catch { return path.basename(String(url || "").split(/[?#]/)[0]); }
}

function getMetaSegments(meta) {
  const groups = [];
  if (!Array.isArray(meta)) return groups;
  for (const item of meta) {
    for (const part of item?.Playlist?.MediaParts || []) {
      if (!Array.isArray(part.MediaSegments) || part.MediaSegments.length === 0) continue;
      groups.push(part.MediaSegments.map((segment) => ({
        index: Number(segment.Index),
        duration: Number(segment.Duration),
        url: String(segment.Url || ""),
        discontinuity: true
      })));
    }
  }
  return groups;
}

function parseMediaPlaylist(text, baseUrl) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim());
  const segments = [];
  let duration = null;
  let discontinuity = true;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      duration = Number(line.match(/^#EXTINF:([^,]+)/)?.[1]);
    } else if (line === "#EXT-X-DISCONTINUITY") {
      discontinuity = true;
    } else if (line && !line.startsWith("#") && Number.isFinite(duration)) {
      segments.push({ index: segments.length, duration, url: new URL(line, baseUrl).href, discontinuity });
      duration = null;
      discontinuity = false;
    }
  }
  const groups = [];
  for (const segment of segments) {
    if (segment.discontinuity || groups.length === 0) groups.push([]);
    groups.at(-1).push(segment);
  }
  return { segments, groups, targetDuration: Number(lines.find((line) => line.startsWith("#EXT-X-TARGETDURATION:"))?.split(":")[1] || 0) };
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

async function fetchSegment(segment, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(segment.url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > options.maxSegmentBytes) throw new Error("TS 响应超过大小限制");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > options.maxSegmentBytes) throw new Error("TS 响应超过大小限制");
    return { ...segment, bytes: buffer.length, bitrate: buffer.length * 8 / segment.duration / 1000, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
  } finally { clearTimeout(timer); }
}

async function mapConcurrent(items, concurrency, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor++;
      try { result[index] = await worker(items[index], index); }
      catch (error) { result[index] = { ...items[index], error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, consume));
  return result;
}

function median(values) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return 0;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remaining.toFixed(3).padStart(6, "0")}`;
}

function normalizeOptions(options = {}) {
  return {
    mode: options.mode === "loose" ? "loose" : "strict",
    minAdSeconds: positive(options.minAdSeconds, 5),
    maxAdSeconds: positive(options.maxAdSeconds, 90),
    neighborBitrateRatio: positive(options.neighborBitrateRatio, 1.7),
    medianBitrateRatio: positive(options.medianBitrateRatio, 1.5),
    maxGroupSegments: positive(options.maxGroupSegments, 5),
    requireDiscontinuity: options.requireDiscontinuity !== false,
    timeoutMs: positive(options.timeoutMs || options.frameTimeoutMs, 30000),
    maxSegmentBytes: positive(options.maxSegmentBytes, 50 * 1024 * 1024),
    concurrency: positive(options.concurrency, 6)
  };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function buildCandidateGroups(groups, measured, options, durationSequence) {
  const all = measured.filter((segment) => !segment.error);
  const baseline = median(all.map((segment) => segment.bitrate));
  const measuredByIndex = new Map(measured.map((segment) => [segment.index, segment]));
  const groupStats = groups.map((original) => {
    const segments = original.map((segment) => measuredByIndex.get(segment.index)).filter(Boolean);
    const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
    const totalBytes = segments.reduce((sum, segment) => sum + (segment.bytes || 0), 0);
    return { original, segments, totalDuration, bitrate: totalDuration && !segments.some((segment) => segment.error) ? totalBytes * 8 / totalDuration / 1000 : 0 };
  });
  let elapsed = 0;
  const scored = [];
  for (let groupIndex = 0; groupIndex < groupStats.length; groupIndex += 1) {
    const current = groupStats[groupIndex];
    const { original, segments, totalDuration, bitrate } = current;
    if (!segments.length || segments.some((segment) => segment.error)) { elapsed += original.reduce((sum, segment) => sum + segment.duration, 0); continue; }
    const neighborBaseline = median([groupStats[groupIndex - 1]?.bitrate, groupStats[groupIndex + 1]?.bitrate].filter((value) => value > 0));
    const ratio = baseline ? bitrate / baseline : 0;
    const neighborRatio = neighborBaseline ? bitrate / neighborBaseline : 0;
    const indexes = segments.map((segment) => segment.index);
    const durations = segments.map((segment) => segment.duration);
    const sequenceMatched = durationSequence.length > 0 && durationSequence.length === durations.length && durationSequence.every((value, index) => Math.abs(value - durations[index]) < 0.001);
    const reasons = [];
    let score = 0;
    let conditions = 0;
    if (segments.length < options.maxGroupSegments) { score += 2; conditions += 1; reasons.push(`discontinuity 区间较短（${segments.length} 段）`); }
    if (totalDuration >= options.minAdSeconds && totalDuration <= options.maxAdSeconds) { score += 1; reasons.push(`总时长 ${totalDuration.toFixed(3)} 秒在广告范围内`); }
    if (ratio >= options.medianBitrateRatio) { score += 3; conditions += 1; reasons.push(`码率 ${bitrate.toFixed(0)} kbps，为全片中位数 ${ratio.toFixed(2)} 倍`); }
    if (neighborRatio >= options.neighborBitrateRatio) { score += 2; conditions += 1; reasons.push(`码率 ${bitrate.toFixed(0)} kbps，为相邻区间 ${neighborRatio.toFixed(2)} 倍`); }
    if (sequenceMatched) { score += 6; conditions += 1; reasons.push("完整匹配当前 duration 序列"); }
    const shortGroup = segments.length < options.maxGroupSegments;
    const accepted = options.mode === "loose" ? conditions >= 1 : shortGroup && conditions >= 2;
    if (!accepted) { elapsed += totalDuration; continue; }
    scored.push({
      groupIndex, startIndex: indexes[0], endIndex: indexes.at(-1), indexSequence: formatIndexSequence(indexes), durationSequence: durations.map((value) => Number(value.toFixed(3))).join(","), startTime: elapsed, endTime: elapsed + totalDuration, totalDuration, bitrateKbps: Number(bitrate.toFixed(0)), score, reasons,
      segments: segments.map((segment) => ({ index: segment.index, duration: segment.duration, hash: getSegmentHash(segment.url), url: segment.url, bitrateKbps: Number(segment.bitrate.toFixed(0)) }))
    });
    elapsed += totalDuration;
  }
  return { candidates: scored, medianBitrateKbps: baseline, allSegments: all };
}

async function detectAds({ url, metaText = "", durationSequence = "", options = {}, onProgress } = {}) {
  if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("只支持 http/https m3u8 地址");
  const normalized = normalizeOptions(options);
  let groups;
  let mediaUrl = url;
  if (metaText.trim()) {
    groups = getMetaSegments(JSON.parse(metaText));
    if (!groups.length) throw new Error("meta_selected.json 中没有媒体片段");
  } else {
    const playlistText = await fetchText(url, normalized.timeoutMs);
    const masterLines = playlistText.split(/\r?\n/);
    const variants = [];
    for (let i = 0; i < masterLines.length; i += 1) {
      if (masterLines[i].startsWith("#EXT-X-STREAM-INF:")) {
        variants.push({ bandwidth: Number(masterLines[i].match(/(?:^|,)BANDWIDTH=(\d+)/)?.[1] || 0), line: masterLines[i + 1] });
      }
    }
    if (variants.length) {
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      mediaUrl = new URL(variants[0].line, url).href;
    }
    const mediaText = variants.length ? await fetchText(mediaUrl, normalized.timeoutMs) : playlistText;
    groups = parseMediaPlaylist(mediaText, mediaUrl).groups;
    if (!groups.length) throw new Error("m3u8 中没有媒体片段");
  }
  const segments = groups.flat();
  const measured = await mapConcurrent(segments, normalized.concurrency, async (segment, index) => {
    onProgress?.({ completed: index, total: segments.length, index: segment.index });
    return fetchSegment(segment, normalized);
  });
  onProgress?.({ completed: segments.length, total: segments.length });
  const result = buildCandidateGroups(groups, measured, normalized, parseDurationSequence(durationSequence));
  return { ok: true, playlistUrl: mediaUrl, segmentCount: segments.length, medianBitrateKbps: result.medianBitrateKbps, failedSegments: measured.filter((segment) => segment.error).map((segment) => ({ index: segment.index, url: segment.url, message: segment.error })), candidates: result.candidates };
}

function addIndexSequenceFilenames(filenames, meta, value) {
  const parsed = parseIndexSequence(value);
  const indexes = new Set(parsed.indexes);
  let matchedCount = 0;
  for (const group of getMetaSegments(meta)) for (const segment of group) if (indexes.has(segment.index)) {
    const filename = getSegmentFilename(segment.url);
    if (filename) { filenames.add(filename); matchedCount += 1; }
  }
  return { count: matchedCount, invalid: parsed.invalid };
}

module.exports = { parseDurationSequence, parseIndexSequence, formatIndexSequence, getSegmentHash, detectAds, addIndexSequenceFilenames };
