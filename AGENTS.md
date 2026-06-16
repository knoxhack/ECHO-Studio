# ECHO Studio Project Notes

Electron desktop app (React + Vite + TypeScript via electron-vite), focused on public SDK creator workflows and local development tooling for the ECHO Platform.

## Stack

- **electron-vite** orchestrates three builds: `main`, `preload`, `renderer`.
- **Renderer:** React 18 + react-router-dom (HashRouter).
- **Storage:** real local filesystem. Projects are folders under a workspace
  (default: `Documents/ECHO Studio/Workspace`). Each project has
  `echo.mod.json`, content folders, Gradle files when generated, and release exports.
- **AI Assistant:** real OpenAI-compatible endpoint (`src/main/aiService.ts`). Configurable base URL, model and API key in Settings.

## Layout

- `src/main/` - Electron main process, filesystem service, packaging, publishing, and IPC handlers.
- `src/preload/` - contextBridge API exposed as `window.studio`.
- `src/shared/` - domain types, constants, validation, templates, AI types, sandbox types, git types, and release contracts imported by both main and renderer.
- `src/renderer/src/pages/` - one component per sidebar screen.

## Commands

- `npm.cmd run typecheck` - type-checks node and web projects.
- `npm.cmd run test` - runs Vitest unit tests.
- `npm.cmd run build` - production build into `out/`.
- `npm.cmd run preview` - build and launch the packaged app preview.
- `npm.cmd run dev` - dev mode with HMR.

## Windows / Environment Gotchas

- Shell is **PowerShell**: use `;` to chain, not `&&`.
- `npm.ps1` may be blocked by execution policy. Prefer `npm.cmd`, not `npm`.
- `ELECTRON_RUN_AS_NODE=1` makes Electron run the main script as plain Node, so `require('electron')` returns a path string and `electron.app` is undefined. Unset it before launching the GUI:
  `Remove-Item Env:\ELECTRON_RUN_AS_NODE`.
- Do **not** set `"type": "module"` in package.json. The Electron main/preload output is CommonJS.
- Electron binary cache can require manual extraction if install fails silently.

## Content Graph Distinction

The **Content Graph** page in `src/renderer/src/pages/ContentGraph.tsx` visualizes authored content (missions, recipes, items, etc.) inside a single ECHO Studio project. It is unrelated to the platform `.ECHO Content Graph` release artifact produced by `ECHO-Modules` and consumed by the launcher/runtimes. When adding graph features here, avoid conflating the two systems.

## Core Safety Rule

Creators build on top of ECHO, never modify ECHO itself. The `echo:` namespace and internal permissions such as `file_system.write_global` and `launcher.catalog.write` are blocked by ECHO Studio validation in `src/shared/validation.ts`.
