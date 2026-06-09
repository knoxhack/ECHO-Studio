# ECHO Addons Studio

Desktop app for authoring, validating, packaging, and publishing ECHO addons.

## Purpose

Desktop app for authoring, validating, packaging, and publishing ECHO addons.

## What Lives Here

Addons Studio source, Electron/package configuration, addon authoring workflows, release policy docs, and update feed settings.

## Release And Update Role

Owns Addons Studio app releases and update metadata. It consumes SDK schemas, templates, and module packaging contracts.

## Public Or Private

Public is optional. Public helps addon authors install and audit the tool; private is reasonable until the authoring workflow is ready.

## Build And Dev Commands

Run commands from the repository root.

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`

## Artifact Ownership

Addons Studio installers, app update metadata, and addon author tooling release notes belong here.

## Release Index Product Routing

App update checks first resolve the canonical Release Index product entry `echo-addons-studio` from `channels/alpha/launcher-channel.json`. The legacy GitHub updater feed is used only as a compatibility fallback while the indexed product entry is warning-state or missing approved updater artifacts.

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
