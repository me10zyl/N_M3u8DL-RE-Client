const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const iconv = require("iconv-lite");
const { normalizeAdSegmentThreshold } = require("./config");
const { addIndexSequenceFilenames } = require("./ad-detector");

function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
async function moveEntry(sourcePath, targetPath) {
  try { await fs.promises.rename(sourcePath, targetPath); return; } catch (error) { if (error.code !== "EXDEV") throw error; }
  const stats = await fs.promises.stat(sourcePath);
  if (stats.isDirectory()) { await fs.promises.cp(sourcePath, targetPath, { recursive: true }); await fs.promises.rm(sourcePath, { recursive: true, force: true }); return; }
  await fs.promises.copyFile(sourcePath, targetPath); await fs.promises.unlink(sourcePath);
}
async function moveDirectoryContents(sourceDir, targetDir) {
  ensureDir(targetDir);
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) await moveEntry(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
}
function decodeOutput(buffer) {
  const utf8Text = buffer.toString("utf8");
  if (utf8Text.includes("�")) { try { return iconv.decode(buffer, "gbk"); } catch (error) { return utf8Text; } }
  return utf8Text;
}
function quoteArg(value) { const text = String(value ?? ""); return /[\s"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text; }
function formatCommand(exePath, args) { return [exePath, ...args].map(quoteArg).filter(Boolean).join(" "); }
function escapeRegex(value) { return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"); }
function getSegmentFilename(url) {
  const text = String(url || "").trim(); if (!text) return "";
  try { return path.basename(new URL(text).pathname); } catch (error) { return path.basename(text.split(/[?#]/)[0]); }
}
function getAllMediaSegments(meta) {
  const segments = []; if (!Array.isArray(meta)) return segments;
  for (const item of meta) for (const part of (item?.Playlist?.MediaParts || [])) if (Array.isArray(part?.MediaSegments)) segments.push(...part.MediaSegments);
  return segments;
}
function parseDurationSequence(value) { return String(value || "").split(/[\s,，]+/).map((item) => Number.parseFloat(item.trim())).filter(Number.isFinite); }
function isSameDuration(left, right) { return Math.abs(Number(left) - right) < 0.001; }
function addFilename(filenames, segment) { const filename = getSegmentFilename(segment?.Url); if (filename) filenames.add(filename); }
function addDurationSequenceFilenames(filenames, meta, durationSequence) {
  const sequence = parseDurationSequence(durationSequence); if (sequence.length === 0) return 0;
  const segments = getAllMediaSegments(meta); let count = 0;
  for (let i = 0; i <= segments.length - sequence.length; i += 1) {
    let matched = true;
    for (let j = 0; j < sequence.length; j += 1) if (!isSameDuration(segments[i + j]?.Duration, sequence[j])) { matched = false; break; }
    if (!matched) continue;
    for (let j = 0; j < sequence.length; j += 1) addFilename(filenames, segments[i + j]);
    count += 1;
  }
  return count;
}
function extractSuspiciousAdFilenames(meta, adSegmentThreshold = 5, durationSequence = "", useSegmentThreshold = true, indexSequence = "") {
  const threshold = normalizeAdSegmentThreshold(adSegmentThreshold); const filenames = new Set(); if (!Array.isArray(meta)) return { filenames: [], durationMatchCount: 0, indexMatchCount: 0, invalidIndexSequence: [] };
  for (const item of meta) for (const part of (item?.Playlist?.MediaParts || [])) {
    const segments = Array.isArray(part?.MediaSegments) ? part.MediaSegments : [];
    if (!useSegmentThreshold || segments.length === 0 || segments.length >= threshold) continue;
    for (const segment of segments) addFilename(filenames, segment);
  }
  const durationMatchCount = addDurationSequenceFilenames(filenames, meta, durationSequence);
  const indexResult = addIndexSequenceFilenames(filenames, meta, indexSequence);
  return { filenames: [...filenames], durationMatchCount, indexMatchCount: indexResult.count, invalidIndexSequence: indexResult.invalid };
}
async function findNewestFile(rootDir, targetName) {
  let newest = null;
  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(entryPath); continue; }
      if (entry.name !== targetName) continue;
      const stats = await fs.promises.stat(entryPath);
      if (!newest || stats.mtimeMs > newest.mtimeMs) newest = { path: entryPath, mtimeMs: stats.mtimeMs };
    }
  }
  await walk(rootDir); return newest ? newest.path : "";
}
function buildDownloadArgs(input, tmpDir, saveDir, saveName, extraArgs = []) { return [input, "--tmp-dir", tmpDir, "--save-dir", saveDir, "--save-name", saveName, "--auto-select", ...extraArgs]; }
function runDownloader(task, args, callbacks = {}) {
  callbacks.onLog?.(`CMD: ${formatCommand(task.exePath, args)}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(task.exePath, args, { windowsHide: true }); callbacks.onProcess?.(child);
    child.stdout.on("data", (data) => callbacks.onLog?.(decodeOutput(data)));
    child.stderr.on("data", (data) => callbacks.onLog?.(decodeOutput(data)));
    child.on("error", (error) => { callbacks.onProcess?.(null); reject(error); });
    child.on("close", (code) => { callbacks.onProcess?.(null); resolve(code); });
  });
}
function resolveFfmpegPath(exePath) {
  const exeDirFfmpeg = exePath ? path.join(path.dirname(exePath), "ffmpeg.exe") : "";
  if (exeDirFfmpeg && fs.existsSync(exeDirFfmpeg)) return exeDirFfmpeg;
  const bundledFfmpeg = path.join(__dirname, "..", "..", "bin", "ffmpeg.exe");
  if (fs.existsSync(bundledFfmpeg)) return bundledFfmpeg;
  return "ffmpeg";
}
function runFfmpegFirstFrame(url, outputPath, exePath = "") {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath(exePath);
    const child = spawn(ffmpegPath, ["-y", "-ss", "0.1", "-i", url, "-frames:v", "1", "-f", "image2", outputPath], { windowsHide: true }); let stderr = "";
    child.stderr.on("data", (data) => { stderr += decodeOutput(data); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`)));
  });
}
async function parseMetaSelected(task, parseTmpDir, callbacks = {}) {
  await fs.promises.rm(parseTmpDir, { recursive: true, force: true }); ensureDir(parseTmpDir);
  const code = await runDownloader(task, buildDownloadArgs(task.url, parseTmpDir, parseTmpDir, task.saveName, ["--skip-download", "--use-system-proxy", task.useSystemProxy ? "true" : "false"]), callbacks);
  if (task.cancelled) return null; if (code !== 0) throw new Error(`Parse exited with code ${code}`);
  const metaPath = await findNewestFile(parseTmpDir, "meta_selected.json"); if (!metaPath) throw new Error("meta_selected.json not found");
  const metaText = await fs.promises.readFile(metaPath, "utf-8"); return { metaText: metaText.replace(/^﻿/, ""), metaPath };
}
async function prepareAdKeyword(task, callbacks = {}) {
  const parseTmpDir = path.join(path.dirname(task.tempShowDir), `${path.basename(task.tempShowDir)}.${task.saveName}.parse`);
  callbacks.onTaskLog?.(`去广告解析：先跳过下载并生成 meta_selected.json，片段阈值 ${task.adSegmentThreshold}。\n`);
  const parsed = await parseMetaSelected(task, parseTmpDir, callbacks); if (!parsed) return "";
  const { filenames, durationMatchCount, indexMatchCount, invalidIndexSequence } = extractSuspiciousAdFilenames(JSON.parse(parsed.metaText), task.adSegmentThreshold, task.adDurationSequence, task.removeAds, task.adIndexSequence);
  await fs.promises.rm(parseTmpDir, { recursive: true, force: true });
  if (durationMatchCount > 0) callbacks.onTaskLog?.(`去广告解析：duration 序列匹配 ${durationMatchCount} 次，已加入对应分片。\n`);
  if (indexMatchCount > 0) callbacks.onTaskLog?.(`去广告解析：Index 序列已启用，共覆盖 ${indexMatchCount} 个 Index。\n`);
  if (invalidIndexSequence.length > 0) callbacks.onTaskLog?.(`去广告解析：忽略无效 Index 规则：${invalidIndexSequence.join(", ")}。\n`);
  if (filenames.length === 0) { callbacks.onTaskLog?.("去广告解析完成：未发现可疑广告分片，将正常下载。\n"); return ""; }
  callbacks.onTaskLog?.(`去广告解析完成：发现 ${filenames.length} 个可疑广告分片。\n`);
  return filenames.map(escapeRegex).join("|");
}
module.exports = { ensureDir, moveDirectoryContents, parseDurationSequence, buildDownloadArgs, runDownloader, runFfmpegFirstFrame, parseMetaSelected, prepareAdKeyword, extractSuspiciousAdFilenames };
