# ECHO Studio

Desktop app for building ECHO experiences, addons, modules, local dev workspaces, validation runs, release assets, and publishing handoffs.

## Purpose

ECHO Studio is the creator and developer workspace for the ECHO ecosystem. It keeps the local loop first: choose modules, generate a Gradle workspace, run preview clients, validate PackOS, package releases, and optionally publish through GitHub.

## What Lives Here

ECHO Studio source, Electron/package configuration, authoring workflows, local Gradle tooling, release policy docs, update feed settings, and Release Index handoff generation.

## Release And Update Role

Owns ECHO Studio app releases and update metadata. It consumes SDK schemas, templates, module packaging contracts, and Release Index product routing.

## Public Or Private

Public is optional. Public helps creators install and audit the tool; private is reasonable until the authoring workflow is ready.

## Build And Dev Commands

Run commands from the repository root.

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`

## Artifact Ownership

ECHO Studio installers, app update metadata, release notes, generated addon packages, and Release Index handoff sidecars belong here.

## Release Index Product Routing

App update checks currently resolve the canonical Release Index product entry `echo-addons-studio` from `channels/alpha/launcher-channel.json`. That id is retained as the compatibility update key while the installed product name and UI are ECHO Studio. The legacy GitHub updater feed is used only as a fallback while the indexed product entry is warning-state or missing approved updater artifacts.

## Docs Index

- [docs/release-policy.md](docs/release-policy.md)
- [AGENTS.md](AGENTS.md)
- [PUBLIC_ALPHA_RELEASE_STATUS.md](PUBLIC_ALPHA_RELEASE_STATUS.md)

## Related Repos

- [knoxhack/ECHO-Launcher](https://github.com/knoxhack/ECHO-Launcher)
- [knoxhack/ECHO-Modules](https://github.com/knoxhack/ECHO-Modules)
- [knoxhack/ECHO-Ashfall-Native-Edition](https://github.com/knoxhack/ECHO-Ashfall-Native-Edition)
- [knoxhack/ECHO-Ashfall-NeoForge-Edition](https://github.com/knoxhack/ECHO-Ashfall-NeoForge-Edition)
- [knoxhack/ECHO-Ashfall-Standalone-Edition](https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition)
- [knoxhack/ECHO-Release-Index](https://github.com/knoxhack/ECHO-Release-Index)
- [knoxhack/ECHO-Native-Platform](https://github.com/knoxhack/ECHO-Native-Platform)
- [knoxhack/ECHO-Standalone-Runtime](https://github.com/knoxhack/ECHO-Standalone-Runtime)
- [knoxhack/ECHO-SDK](https://github.com/knoxhack/ECHO-SDK)
- [knoxhack/ECHO-Developer-Studio](https://github.com/knoxhack/ECHO-Developer-Studio)
- [knoxhack/ECHO-Platform-Website](https://github.com/knoxhack/ECHO-Platform-Website)
