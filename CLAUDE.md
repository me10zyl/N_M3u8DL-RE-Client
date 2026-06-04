# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Windows-focused Electron GUI client for `N_m3u8DL-RE`. It downloads batches of m3u8 links, runs `bin/N_m3u8DL-RE.exe`, optionally performs ad-segment filtering by parsing `meta_selected.json`, and moves finished output from a temporary directory to the final directory.

The app is a CommonJS Electron project using plain HTML/CSS/JavaScript. There is no React/Vue build pipeline.

## Common Commands

```bash
npm install          # install dependencies
npm start            # run the Electron app
npm run dist:win     # build Windows package with electron-builder
npm run dist         # run electron-builder
```

There is currently no configured lint or test script in `package.json`.

For syntax checks during development, use Node directly:

```bash
node --check main.js
node --check preload.js
node --check renderer.js
node --check cms-renderer.js
for f in src/main/*.js; do node --check "$f" || exit 1; done
```

## Architecture

### Electron process split

- `main.js` creates the Electron `BrowserWindow` and registers IPC handlers.
- `preload.js` exposes safe renderer APIs through `contextBridge`.
- `index.html`, `style.css`, `renderer.js`, and `cms-renderer.js` implement the renderer UI.

The main-process implementation is split under `src/main/`:

- `config.js` reads/writes the Electron `config.json`, normalizes defaults, migrates old config shape, and registers `config:*` IPC.
- `dialogs.js` registers file/directory picker IPC.
- `tasks.js` owns the global download queue, `N_m3u8DL-RE` process lifecycle, cancellation, task updates, and output moving.
- `download-helpers.js` contains download/ad-removal helpers shared by task execution and ad debugging.
- `ad-debug.js` handles `meta_selected.json` parsing and first-frame preview IPC.
- `cms.js` currently owns CMS source settings IPC and CMS placeholder IPC.
- `shell.js` exposes restricted external URL opening; keep it limited to `http`/`https`.

### Renderer structure

The left sidebar has two primary entries only:

- Download: existing batch m3u8 download flow.
- CMS Video: CMS module area.

`renderer.js` manages the original download UI, download settings, multi-page download tabs, batch parsing, task list rendering, and ad-debug modal.

`cms-renderer.js` manages the CMS area placeholder and CMS source settings. It currently supports source add/edit/delete and URL-format testing. Full CMS list/search/detail/play/download flows are planned but not fully implemented yet.

### Configuration

Config is stored in Electron user data as `config.json` via `app.getPath("userData")`.

Important config fields:

- `exePath`: path to `N_m3u8DL-RE.exe`.
- `tempRoot`: temporary download root.
- `defaultFinalRoot`: default final download directory; used for new download pages and future CMS downloads.
- `pages`: per-download-page state for the original download UI.
- `removeAds`, `useSystemProxy`, `adSegmentThreshold`, `adDurationSequence`: shared download options.
- `cms.activeSourceId`, `cms.sources`, `cms.history`: CMS module state.

`config:set` merges incoming config with existing config before writing so renderer modules do not accidentally drop unrelated fields.

### Download queue behavior

There is one global queue in `src/main/tasks.js`. Original downloads and future CMS downloads should use the same `tasks:start` IPC so that ad removal, proxy settings, temp directory handling, command logging, and cancellation behavior stay identical.

Existing task IPC names should remain compatible:

- `tasks:start`
- `tasks:cancel`
- `tasks:stop-all`
- `tasks:remove`

Renderer task updates arrive through `task:update`.

### Ad-removal debugging

Ad-removal logic uses `N_m3u8DL-RE` with `--skip-download` to generate `meta_selected.json`, then extracts suspicious segment filenames using threshold and duration-sequence matching. The ad-debug modal in the renderer uses:

- `ad-debug:meta`
- `ad-debug:first-frame`
- `ad-debug:log`

## Current CMS Module State

The CMS feature has a design document at:

```text
docs/superpowers/specs/2026-06-04-cms-video-module-design.md
```

Implemented so far:

- Sidebar entry for CMS Video.
- CMS content panels: list placeholder, CMS settings, history placeholder, download-center placeholder.
- CMS source settings add/edit/delete.
- CMS config persistence.
- `cms:request` placeholder IPC.

Not implemented yet:

- Real Mac CMS API requests (`ac=list`, `ac=videolist`, `ac=detail`).
- CMS category/list/search/pagination rendering.
- Verification BrowserWindow/Cookie handling.
- Detail page playback and episode selection.
- Cross-source detail matching.
- CMS-to-download queue integration.
- CMS download center task grouping.

## Notes for Future Changes

- Keep original download IPC and behavior stable; CMS downloads should adapt to the existing queue instead of creating a second downloader.
- Do not place CMS settings/history/download-center as left-sidebar entries; they belong inside the CMS Video content area.
- If adding real CMS network requests in `src/main/cms.js`, keep request targets restricted to `http`/`https`, add timeouts/response-size limits, and avoid exposing arbitrary fetch capability to the renderer.
- Do not render CMS-provided HTML directly in the renderer; treat CMS text as untrusted content.
