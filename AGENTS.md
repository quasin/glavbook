# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Glavbook** — an Electron-based multi-tab browser ("AI Book Handler") with per-tab proxy support. Built with vanilla JavaScript, no frameworks, no bundler.

## Tech Stack

- **Electron 44** (only dependency)
- Vanilla JS (CommonJS `require`), plain HTML/CSS
- **Yarn 4** (via corepack, `packageManager: yarn@4.18.0`)
- Node 24

## Commands

```bash
yarn install      # install dependencies
yarn start        # run the app (electron .)
./installdev.sh   # bootstrap a fresh dev machine (Node 24, corepack, yarn)
```

No linter, formatter, or test suite is configured yet.

## Architecture

- `main.js` — Electron main process: creates the `BrowserWindow` (size/fullscreen from `[Graphics]` in settings.ini), handles proxy credentials via the `app.on('login')` event (credentials stored in `proxyAuthMap` keyed by `host:port`, refcounted), the `set-tab-proxy` IPC handler (parses proxy URLs, strips embedded credentials, calls `session.setProxy`; returns `false` on parse failure), `release-proxy-credentials` (drops credential refs when a tab changes or closes its proxy), `load-settings` (INI persistence), `save-session` (open-tab slots/URLs/proxies → `[Session]` section; prunes orphaned `Partitions/slot-N` dirs at startup), and `[Audio]` handling (`mute = true` hard-mutes every attached webview via `setAudioMuted`; applied when each webview attaches).
- `renderer.js` — UI logic: tab lifecycle (`createTab`, `setActiveTab`, `closeTab`), navigation (`navigateTo` falls back to Google search for non-URLs), per-tab proxy (`applyProxy` invokes IPC then reloads the webview), and session persistence (`saveSession` snapshots slots/URLs/proxies on create/close/navigate; `restoreSession` recreates the tabs that were open at quit — closed tabs stay closed — reapplying each tab's proxy via IPC before its first load). Quick-links sidebar buttons use inline `onclick` in `index.html`.
- `index.html` — layout: tab bar, nav/proxy toolbar, sidebar, `webview-container`.
- `style.css` — styling.

## Key Conventions & Gotchas

- Each tab gets an **isolated persistent session partition** named `persist:slot-N` (slot numbers never reused within a run); proxy settings are applied per partition. Cookies/localStorage survive restarts: on launch `restoreSession` recreates the tabs listed in settings.ini `[Session]`, each reattached to its old partition. Closing a tab abandons its slot (its `Partitions/slot-N` dir is pruned at next startup).
- `main.js` enables `webviewTag`, `nodeIntegration: true`, `contextIsolation: false` — renderer code runs with Node access; keep that in mind for security.
- Proxy URLs may embed credentials (`http://user:pass@host:port`); main process extracts them for the `login` event and passes only a clean URL to Chromium.
- Popup/new-window requests from webviews are denied and routed to `open-new-tab` IPC → new tab in the UI.
- Sidebar quick-links (Gemini, Alice, Claude, search engines) are defined inline in `index.html`.
