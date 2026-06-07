# ECHO Addon Studio — Project Notes

Electron desktop app (React + Vite + TypeScript via electron-vite) — the public,
SDK-focused creator studio for building addons on top of the ECHO Platform.

## Stack
- **electron-vite** orchestrates three builds: `main`, `preload`, `renderer`.
- **Renderer:** React 18 + react-router-dom (HashRouter).
- **Storage:** real local filesystem. Projects are folders under a workspace
  (default: `Documents/ECHO Addon Studio/Workspace`). Each project has
  `echo.mod.json`, content folders, etc.
- **AI Assistant:** real OpenAI-compatible endpoint (`src/main/aiService.ts`). Configurable base URL, model and API key in Settings.

## Layout
- `src/main/` — Electron main process + filesystem service + IPC handlers.
- `src/preload/` — contextBridge API exposed as `window.studio`.
- `src/shared/` — domain types, constants, PackOS validation, templates, AI types,
  sandbox types, git types (imported by BOTH main and renderer; keep cross-process types here).
- `src/renderer/src/pages/` — one component per sidebar screen.

## Commands
- `npm.cmd run typecheck` — type-checks node + web projects.
- `npm.cmd run test` — runs Vitest unit tests (shared pure functions).
- `npm.cmd run build` — production build into `out/`.
- `npm.cmd run preview` — build + launch the packaged app.
- `npm.cmd run dev` — dev mode with HMR.

## Windows / environment gotchas (important)
- Shell is **PowerShell**: use `;` to chain, not `&&`.
- `npm.ps1` is blocked by execution policy — **always invoke `npm.cmd`**, not `npm`.
- `ELECTRON_RUN_AS_NODE=1` is set in this environment. It makes Electron run the
  main script as plain Node, so `require('electron')` returns a path string and
  `electron.app` is undefined. **Unset it before launching the GUI:**
  `Remove-Item Env:\ELECTRON_RUN_AS_NODE` (in the same shell as `preview`/`dev`).
- Do **not** set `"type": "module"` in package.json. The Electron main/preload must
  be emitted as CommonJS, otherwise named imports from `electron` fail in ESM.
- Electron binary: this machine has **electron v42.0.1** cached offline at
  `%LOCALAPPDATA%\electron\Cache`. package.json pins `electron` to `42.0.1`.
  If `node_modules/electron/dist/electron.exe` is missing after install, the
  auto-extract failed silently — extract the cached zip manually:
  `Expand-Archive "$env:LOCALAPPDATA\electron\Cache\electron-v42.0.1-win32-x64.zip" node_modules\electron\dist -Force`
  and ensure `node_modules\electron\path.txt` contains `electron.exe`.

## Core safety rule
Creators build *on top of* ECHO, never modify ECHO itself. The `echo:` namespace and
internal permissions (e.g. `file_system.write_global`, `launcher.catalog.write`) are
blocked by PackOS validation in `src/shared/validation.ts`.
