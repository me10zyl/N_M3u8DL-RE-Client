#!/usr/bin/env node
"use strict";

const { URL } = require("url");
const crypto = require("crypto");

const DEFAULTS = {
  concurrency: 6,
  timeoutMs: 30000,
  maxSegmentBytes: 50 * 1024 * 1024,
  minAdSeconds: 5,
  maxAdSeconds: 90,
  scoreThreshold: 5
};

function usage() {
  console.error(`Usage: node scripts/detect-ads.js <m3u8-url> [options]

Options:
  --json                         Output machine-readable JSON
  --duration-sequence <values>   Exact duration sequence, comma/space separated
  --concurrency <n>              Concurrent TS downloads (default: 6)
  --timeout <ms>                 Request timeout (default: 30000)
  --min-seconds <n>              Minimum candidate duration (default: 5)
  --max-seconds <n>              Maximum candidate duration (default: 90)
  --threshold <n>                Suspicion score threshold (default: 5)
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS, json: false, durationSequence: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--duration-sequence") options.durationSequence = parseNumbers(argv[++i]);
    else if (arg === "--concurrency") options.concurrency = positiveNumber(argv[++i], options.concurrency);
    else if (arg === "--timeout") options.timeoutMs = positiveNumber(argv[++i], options.timeoutMs);
    else if (arg === "--min-seconds") options.minAdSeconds = positiveNumber(argv[++i], options.minAdSeconds);
    else if (arg === "--max-seconds") options.maxAdSeconds = positiveNumber(argv[++i], options.maxAdSeconds);
    else if (arg === "--threshold") options.scoreThreshold = positiveNumber(argv[++i], options.scoreThreshold);
    else if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error("Exactly one m3u8 URL is required");
  options.url = positional[0];
  return options;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseNumbers(value) {
  return String(value || "").split(/[\s,，]+/).map(Number).filter(Number.isFinite);
}

async function fetchBytes(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const contentLength = Number(response.headers.get("content-length"));
    if (contentLength > options.maxSegmentBytes) throw new Error("response exceeds size limit");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > options.maxSegmentBytes) throw new Error("response exceeds size limit");
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

function parsePlaylist(text, baseUrl) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const streams = [];
  let pendingStream = null;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const bandwidth = Number(line.match(/(?:^|,)BANDWIDTH=(\d+)/)?.[1] || 0);
      pendingStream = { bandwidth };
    } else if (pendingStream && !line.startsWith("#")) {
      streams.push({ ...pendingStream, url: new URL(line, baseUrl).href });
      pendingStream = null;
    }
  }
  if (streams.length > 0) {
    streams.sort((left, right) => right.bandwidth - left.bandwidth);
    return { type: "master", streams };
  }

  const segments = [];
  let pendingDuration = null;
  let discontinuity = true;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      pendingDuration = Number(line.match(/^#EXTINF:([^,]+)/)?.[1]);
      if (!Number.isFinite(pendingDuration)) pendingDuration = null;
    } else if (line === "#EXT-X-DISCONTINUITY") {
      discontinuity = true;
    } else if (!line.startsWith("#") && pendingDuration !== null) {
      segments.push({
        index: segments.length,
        duration: pendingDuration,
        url: new URL(line, baseUrl).href,
        discontinuity
      });
      pendingDuration = null;
      discontinuity = false;
    }
  }
  return { type: "media", segments, targetDuration: Number(lines.find((line) => line.startsWith("#EXT-X-TARGETDURATION:"))?.split(":")[1] || 0) };
}

function getHash(url) {
  const parsed = new URL(url);
  const hash = parsed.searchParams.get("hash");
  if (hash) return hash;
  return parsed.pathname.split("/").pop() || url;
}

function groupSegments(segments) {
  const groups = [];
  for (const segment of segments) {
    if (segment.discontinuity || groups.length === 0) groups.push([]);
    groups.at(-1).push(segment);
  }
  return groups;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try { results[index] = await worker(items[index], index); }
      catch (error) { results[index] = { error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

function sameDuration(left, right) {
  return Math.abs(left - right) < 0.001;
}

function findDurationMatches(segments, sequence) {
  if (sequence.length === 0) return [];
  const matches = [];
  for (let i = 0; i <= segments.length - sequence.length; i += 1) {
    if (sequence.every((duration, offset) => sameDuration(segments[i + offset].duration, duration))) matches.push(i);
  }
  return matches;
}

function median(numbers) {
  const values = numbers.filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function scoreGroups(groups, allSegments, options) {
  const validBitrates = allSegments.map((segment) => segment.bitrate).filter(Number.isFinite);
  const baseline = median(validBitrates);
  return groups.map((segments, groupIndex) => {
    const totalSeconds = segments.reduce((sum, segment) => sum + segment.duration, 0);
    const totalBytes = segments.reduce((sum, segment) => sum + (segment.bytes || 0), 0);
    const bitrate = totalSeconds > 0 ? totalBytes * 8 / totalSeconds / 1000 : 0;
    const ratio = baseline > 0 ? bitrate / baseline : 0;
    const previous = groups[groupIndex - 1];
    const next = groups[groupIndex + 1];
    const neighborBitrates = [previous, next].map((group) => group?.reduce((sum, segment) => sum + (segment.bytes || 0), 0) * 8 / (group?.reduce((sum, segment) => sum + segment.duration, 0) || 1) / 1000).filter(Number.isFinite);
    const neighborBaseline = median(neighborBitrates) || baseline;
    const neighborRatio = neighborBaseline > 0 ? bitrate / neighborBaseline : 0;
    const exactMatches = findDurationMatches(allSegments, options.durationSequence).filter((start) => {
      const end = start + options.durationSequence.length;
      return segments.some((segment) => segment.index >= start && segment.index < end);
    });
    let score = 0;
    const reasons = [];
    if (segments.length < 5) { score += 2; reasons.push(`short discontinuity group (${segments.length} segments)`); }
    if (totalSeconds >= options.minAdSeconds && totalSeconds <= options.maxAdSeconds) { score += 1; reasons.push(`duration ${totalSeconds.toFixed(3)}s in ad range`); }
    if (ratio >= 1.5) { score += 3; reasons.push(`bitrate ${bitrate.toFixed(0)}kbps (${ratio.toFixed(2)}x median)`); }
    else if (neighborRatio >= 1.7) { score += 2; reasons.push(`bitrate ${bitrate.toFixed(0)}kbps (${neighborRatio.toFixed(2)}x neighbors)`); }
    if (exactMatches.length > 0) { score += 6; reasons.push("matches supplied duration sequence"); }
    return { groupIndex, segments, totalSeconds, bitrate, score, reasons };
  });
}

async function detect(options) {
  const firstText = (await fetchBytes(options.url, { ...options, maxSegmentBytes: 10 * 1024 * 1024 })).toString("utf8");
  let playlist = parsePlaylist(firstText, options.url);
  let mediaUrl = options.url;
  if (playlist.type === "master") {
    mediaUrl = playlist.streams[0].url;
    playlist = parsePlaylist((await fetchBytes(mediaUrl, { ...options, maxSegmentBytes: 10 * 1024 * 1024 })).toString("utf8"), mediaUrl);
  }
  if (playlist.type !== "media" || playlist.segments.length === 0) throw new Error("No media segments found");

  const measured = await mapConcurrent(playlist.segments, options.concurrency, async (segment) => {
    const bytes = await fetchBytes(segment.url, options);
    return { ...segment, bytes: bytes.length, bitrate: bytes.length * 8 / segment.duration / 1000, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  });
  const errors = measured.filter((segment) => segment.error);
  const segments = measured.filter((segment) => !segment.error);
  const groups = groupSegments(segments);
  const scored = scoreGroups(groups, segments, options);
  const candidates = scored.filter((group) => group.score >= options.scoreThreshold);
  return {
    playlistUrl: mediaUrl,
    targetDuration: playlist.targetDuration,
    segmentCount: playlist.segments.length,
    failedSegments: errors.map((segment, index) => ({ index, error: segment.error })),
    medianBitrateKbps: median(segments.map((segment) => segment.bitrate)),
    candidates: candidates.map((group) => ({
      score: group.score,
      reason: group.reasons,
      startIndex: group.segments[0].index,
      endIndex: group.segments.at(-1).index,
      duration: Number(group.totalSeconds.toFixed(3)),
      bitrateKbps: Number(group.bitrate.toFixed(0)),
      hashes: group.segments.map((segment) => getHash(segment.url)),
      urls: group.segments.map((segment) => segment.url),
      segments: group.segments.map((segment) => ({ index: segment.index, duration: segment.duration, bitrateKbps: Number(segment.bitrate.toFixed(0)), hash: getHash(segment.url), url: segment.url, sha256: segment.sha256 }))
    }))
  };
}

(async () => {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { usage(); return; }
    const result = await detect(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Media playlist: ${result.playlistUrl}`);
      console.log(`Segments: ${result.segmentCount}, median bitrate: ${result.medianBitrateKbps.toFixed(0)} kbps`);
      if (result.failedSegments.length) console.log(`Failed downloads: ${result.failedSegments.length}`);
      if (!result.candidates.length) console.log("No suspicious ad segments found.");
      for (const candidate of result.candidates) {
        console.log(`\nCandidate ${candidate.startIndex}-${candidate.endIndex}, ${candidate.duration}s, ${candidate.bitrateKbps}kbps, score=${candidate.score}`);
        console.log(`Reason: ${candidate.reason.join("; ")}`);
        console.log("Segments:");
        for (const segment of candidate.segments) {
          console.log(`  Index ${segment.index}: hash=${segment.hash}, url=${segment.url}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    usage();
    process.exitCode = 1;
  }
})();
