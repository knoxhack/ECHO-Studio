# ECHO Release Feed Policy

This policy is the canonical source of truth for every alpha release stream. A
release job must fail closed when source constants, builder publish targets, CI
inputs, or GitHub repository settings do not match this table exactly.

## Canonical feed map

| Track | Stream | GitHub owner | GitHub repo | Tag prefix |
| --- | --- | --- | --- | --- |
| public | echo-launcher | knoxhack | ECHO-Launcher | launcher-v |
| public | echo-addons-studio | knoxhack | ECHO-Addons-Studio | v |
| public | echo-developers-studio | knoxhack | ECHO-Developer-Studio | v |
| public | echo-sdk | knoxhack | ECHO-SDK | sdk-v |
| public | echo-modules | knoxhack | ECHO-Modules | modules-v |
| public | ashfall-native-edition | knoxhack | ECHO-Ashfall-Native-Edition | ashfall-native-v |
| public | ashfall-neoforge-edition | knoxhack | ECHO-Ashfall-NeoForge-Edition | ashfall-neoforge-v |
| public | ashfall-standalone-edition | knoxhack | ECHO-Ashfall-Standalone-Edition | ashfall-standalone-v |
| index | echo-release-index | knoxhack | ECHO-Release-Index | index-v |

## Invariants

- Each release job has exactly one updater target repository.
- Public app updates ship from public `knoxhack` repositories.
- Public feeds must not contain internal artifacts, release metadata, updater manifests, or comments that point users to internal repositories.
- Internal feeds must not contain public artifacts, public updater manifests, or fallback links to public repositories.
- A release job must fail closed on any mismatch between this policy, source constants, package publish config, builder config, and workflow inputs.
- Stream variables are explicit per job and cannot be inferred from mutable user settings.
- Runtime update code must assert its selected owner/repo before contacting the updater feed.

## Required GitHub repository variables

Every release repository must define the variables that correspond to its track:

| Variable | Public repositories | Internal repositories |
| --- | --- | --- |
| RELEASE_FEED_OWNER | knoxhack | knoxhack |
| RELEASE_FEED_REPO | canonical repo for the job | canonical repo for the job |
| PUBLIC_FEED_OWNER | knoxhack | knoxhack |
| PUBLIC_FEED_REPO | public canonical repo, if the app has one | public canonical repo, if the app has one |
| INTERNAL_FEED_OWNER | unset unless dual-track | knoxhack |
| INTERNAL_FEED_REPO | unset unless dual-track | internal canonical repo |

The `scripts/validate-release-feed.mjs` preflight is mandatory for every release
job and must run before build, package, or publish steps.

Release workflows that publish installable artifacts must also generate GitHub
artifact attestations. The workflow must grant `id-token: write` and
`attestations: write`, write a `release/SHA256SUMS.txt` subject checksum file,
and run `actions/attest@v4` with `subject-checksums: release/SHA256SUMS.txt`
before uploading the checksum manifest.
