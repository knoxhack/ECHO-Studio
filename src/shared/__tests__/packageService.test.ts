import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { describe, expect, it, vi } from 'vitest'
import type { DevWorkspaceState } from '../devWorkspace'
import type { AddonManifest } from '../types'

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir()
  }
}))

function manifest(): AddonManifest {
  return {
    schemaVersion: 1,
    id: 'teamnova:weather_pack',
    name: 'Weather Pack',
    version: '1.0.0',
    description: 'A test addon package for release packaging.',
    developerType: 'addon_developer',
    publisher: { id: 'teamnova', name: 'Team Nova', type: 'team' },
    projectClass: 'gameplay_addon',
    namespace: 'teamnova',
    target: { experiences: ['ashfall'], modules: [] },
    runtime: { supports: ['echo_native', 'neoforge', 'standalone'], nativeReadiness: 'partial', minimumEchoSdk: '1.4.0' },
    permissions: ['addon_storage.write'],
    dependencies: { required: ['echo:core'], optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community', issues: 'https://example.com/issues' },
    tags: ['test']
  }
}

function devWorkspace(overrides?: Partial<DevWorkspaceState>): DevWorkspaceState {
  return {
    ready: true,
    mode: 'gradle',
    projectPath: 'C:\\test\\project',
    gradleReady: true,
    hasGradleWrapper: true,
    sourceReady: true,
    runtimeTargets: ['neoforge'],
    files: [],
    modulePlan: {
      declared: ['echo:core'],
      normalizedDeclared: ['echocore'],
      enabled: [],
      unknown: [],
      missingRequired: [],
      optionalAvailable: [],
      closure: []
    },
    moduleCatalog: {
      schemaVersion: 'echo.studio.modules.catalog.status.v1',
      source: 'builtin',
      localAvailable: false,
      warnings: []
    },
    moduleWorkspace: {
      schemaVersion: 'echo.studio.modules.workspace.status.v1',
      path: '.echo-studio/module-workspace.json',
      exists: true,
      upToDate: true,
      projectMatches: true,
      moduleCount: 1,
      localModuleCount: 0,
      expectedModuleIds: ['echocore'],
      mappedModuleIds: ['echocore'],
      missingFromMap: [],
      extraInMap: [],
      generatedAt: '2026-06-09T00:00:00.000Z'
    },
    moduleLock: {
      schemaVersion: 'echo.studio.modules.lock.status.v1',
      studioLockPath: '.echo-studio/modules.lock.json',
      runtimeLockPath: 'src/generated/resources/META-INF/echo.modules.lock.json',
      studioExists: true,
      runtimeExists: true,
      runtimeExpected: true,
      upToDate: true,
      runtimeUpToDate: true,
      projectMatches: true,
      expectedModuleIds: ['echocore'],
      lockedModuleIds: ['echocore'],
      runtimeModuleIds: ['echocore'],
      missingFromLock: [],
      extraInLock: [],
      missingFromRuntimeLock: [],
      extraInRuntimeLock: [],
      lockedProjectId: 'teamnova:weather_pack',
      lockedProjectVersion: '1.0.0',
      generatedAt: '2026-06-09T00:00:00.000Z'
    },
    runtimeLaunchers: {
      schemaVersion: 'echo.studio.runtime.launchers.status.v1',
      gradlePropertiesPath: 'gradle.properties',
      gradlePropertiesExists: true,
      nativeExpected: false,
      nativeConfigured: false,
      nativeExecutable: '',
      standaloneExpected: false,
      standaloneConfigured: false,
      standaloneExecutable: '',
      ready: true
    },
    artifacts: [],
    lastSetupAt: '2026-06-09T00:00:00.000Z',
    ...overrides
  }
}

describe('packageAddon', () => {
  it('writes SDK-validated release artifacts and sidecars', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-addon-package-'))
    const previousCommitSha = process.env.ECHO_STUDIO_COMMIT_SHA
    const previousLegacyCommitSha = process.env.ECHO_ADDON_STUDIO_COMMIT_SHA
    process.env.ECHO_STUDIO_COMMIT_SHA = '1234567890abcdef1234567890abcdef12345678'
    delete process.env.ECHO_ADDON_STUDIO_COMMIT_SHA
    try {
      const project = path.join(root, 'project')
      await fs.mkdir(project, { recursive: true })
      await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest(), null, 2), 'utf8')
      await fs.mkdir(path.join(project, 'assets'), { recursive: true })
      await fs.writeFile(path.join(project, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      await fs.mkdir(path.join(project, '.echo-studio', 'logs'), { recursive: true })
      await fs.writeFile(path.join(project, '.echo-studio', 'logs', 'dev-client.log'), 'local runtime log', 'utf8')
      await fs.mkdir(path.join(project, '.gradle', 'cache'), { recursive: true })
      await fs.writeFile(path.join(project, '.gradle', 'cache', 'state.bin'), 'gradle cache', 'utf8')
      await fs.mkdir(path.join(project, 'build', 'libs'), { recursive: true })
      await fs.writeFile(path.join(project, 'build', 'libs', 'stale.jar'), 'stale build output', 'utf8')
      await fs.mkdir(path.join(project, 'release'), { recursive: true })
      await fs.writeFile(path.join(project, 'release', 'scratch.txt'), 'release scratch', 'utf8')
      await fs.mkdir(path.join(project, 'src', 'generated', 'resources', 'META-INF'), { recursive: true })
      await fs.writeFile(
        path.join(project, 'src', 'generated', 'resources', 'META-INF', 'echo.modules.lock.json'),
        JSON.stringify({ schemaVersion: 'echo.studio.modules.lock.v1', modules: [{ id: 'echocore' }] }, null, 2),
        'utf8'
      )

      const { packageAddon } = await import('../../main/packageService')
      const result = await packageAddon(project)
      const assetNames = result.assetPaths.map((assetPath) => path.basename(assetPath)).sort()
      const addonEntries = new AdmZip(result.zipPath).getEntries().map((entry) => entry.entryName)
      const sourcesPath = result.assetPaths.find((assetPath) => assetPath.endsWith('-sources.jar'))
      const neoforgePath = result.assetPaths.find((assetPath) => assetPath.endsWith('-neoforge.jar'))
      expect(sourcesPath).toBeDefined()
      expect(neoforgePath).toBeDefined()
      const sourceEntries = new AdmZip(sourcesPath ?? '').getEntries().map((entry) => entry.entryName)
      const neoforgeZip = new AdmZip(neoforgePath ?? '')
      const neoforgeToml = neoforgeZip.readAsText('META-INF/neoforge.mods.toml')
      for (const entries of [addonEntries, sourceEntries]) {
        expect(entries.some((entry) => entry.startsWith('.echo-studio/'))).toBe(false)
        expect(entries.some((entry) => entry.startsWith('.gradle/'))).toBe(false)
        expect(entries.some((entry) => entry.startsWith('build/'))).toBe(false)
        expect(entries.some((entry) => entry.startsWith('release/'))).toBe(false)
        expect(entries.some((entry) => entry.startsWith('exports/'))).toBe(false)
      }
      expect(addonEntries).toContain('assets/icon.png')
      expect(addonEntries).toContain('src/generated/resources/META-INF/echo.modules.lock.json')
      expect(sourceEntries).toContain('src/generated/resources/META-INF/echo.modules.lock.json')
      expect(neoforgeZip.getEntries().map((entry) => entry.entryName)).toContain('META-INF/neoforge.mods.toml')
      expect(neoforgeToml).toContain('# Generated by ECHO Studio')
      expect(neoforgeToml).toContain('modId="weather_pack"')
      expect(neoforgeToml).toContain('displayName="Weather Pack"')

      expect(result.sdkValidation).toEqual({ ok: true, issues: [] })
      expect(assetNames).toEqual([
        'weather_pack-1.0.0-neoforge.jar',
        'weather_pack-1.0.0-sources.jar',
        'weather_pack-1.0.0-standalone.jar',
        'weather_pack-1.0.0.echo-addon'
      ])
      expect(await fs.readFile(result.checksumsPath ?? '', 'utf8')).toContain('weather_pack-1.0.0-neoforge.jar')
      expect(await fs.readFile(result.checksumsPath ?? '', 'utf8')).toContain('echo-release.json')
      const packageManifest = JSON.parse(await fs.readFile(result.packageManifestPath ?? '', 'utf8'))
      expect(packageManifest).toMatchObject({
        schemaVersion: 'echo.addon.package.v1',
        dependencies: [{ id: 'echo:core', kind: 'module', version: '*' }]
      })
      const releaseManifest = JSON.parse(await fs.readFile(result.releaseManifestPath ?? '', 'utf8'))
      expect(releaseManifest).toMatchObject({
        schemaVersion: 'echo.release.index.entry.v1',
        id: 'weather_pack',
        kind: 'addon',
        version: '1.0.0',
        channel: 'alpha',
        publisher: 'teamnova',
        sourceRepo: 'teamnova/weather_pack-addon',
        releaseTag: 'v1.0.0',
        commitSha: '1234567890abcdef1234567890abcdef12345678',
        validation: 'warning',
        dependencies: [{ id: 'echo:core', kind: 'module', version: '*' }],
        compatibility: ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition']
      })
      expect(releaseManifest.artifacts.native).toMatchObject({
        file: 'weather_pack-1.0.0.echo-addon',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/i),
        size: expect.any(Number)
      })
      expect(releaseManifest.assets.map((asset: { name: string }) => asset.name).sort()).toEqual(assetNames)
      const handoff = JSON.parse(await fs.readFile(result.releaseIndexHandoffPath ?? '', 'utf8'))
      expect(handoff).toMatchObject({
        schemaVersion: 'echo.release.index.handoff.v1',
        targetRepository: 'knoxhack/ECHO-Release-Index',
        targetCollection: 'addons',
        entryFileName: 'weather_pack.json',
        sourceRepo: 'teamnova/weather_pack-addon',
        releaseTag: 'v1.0.0',
        commitSha: '1234567890abcdef1234567890abcdef12345678',
        checksums: {
          file: 'checksums.sha256',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/i)
        },
        attestation: {
          mode: 'required-for-official-or-verified',
          provider: 'github-artifact-attestations',
          requireDigestMatch: true
        },
        ingestion: {
          status: 'pending-review',
          requireSchemaValidation: true
        }
      })
      expect(handoff.assets.map((asset: { name: string }) => asset.name)).toEqual(expect.arrayContaining([
        'weather_pack-1.0.0.echo-addon',
        'checksums.sha256',
        'echo-addon-package.json',
        'echo-release.json'
      ]))
      expect(handoff.attestation.subjects.map((subject: { name: string }) => subject.name).sort()).toEqual(assetNames)
      const draft = JSON.parse(await fs.readFile(result.releaseDraftPath ?? '', 'utf8'))
      expect(draft.assets).toHaveLength(8)
      expect(draft.assets.map((asset: { name: string }) => asset.name)).toContain('echo-release.json')
      expect(draft.assets.map((asset: { name: string }) => asset.name)).toContain('release-index-handoff.json')
      expect(draft.assets.every((asset: { sha256?: string }) => /^[a-f0-9]{64}$/i.test(asset.sha256 ?? ''))).toBe(true)
      expect(draft.assets.find((asset: { name: string }) => asset.name === 'checksums.sha256')?.sha256).toMatch(/^[a-f0-9]{64}$/i)
      expect(draft.releaseIndex).toMatchObject({
        commitSha: '1234567890abcdef1234567890abcdef12345678',
        artifacts: {
          native: { file: 'weather_pack-1.0.0.echo-addon' }
        }
      })
      expect(draft.releaseIndexHandoff.entryFileName).toBe('weather_pack.json')
      expect(draft.attestation.subjects).toHaveLength(assetNames.length)
      expect(result.releaseIndexHandoff?.entryFileName).toBe('weather_pack.json')
    } finally {
      if (previousCommitSha === undefined) delete process.env.ECHO_STUDIO_COMMIT_SHA
      else process.env.ECHO_STUDIO_COMMIT_SHA = previousCommitSha
      if (previousLegacyCommitSha === undefined) delete process.env.ECHO_ADDON_STUDIO_COMMIT_SHA
      else process.env.ECHO_ADDON_STUDIO_COMMIT_SHA = previousLegacyCommitSha
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('includes dev workspace errors in package reports without pre-package artifact warnings', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-addon-package-'))
    try {
      const project = path.join(root, 'project')
      await fs.mkdir(project, { recursive: true })
      await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest(), null, 2), 'utf8')

      const { packageAddon } = await import('../../main/packageService')
      const result = await packageAddon(project, devWorkspace({
        ready: false,
        moduleLock: {
          ...devWorkspace().moduleLock,
          upToDate: false,
          runtimeUpToDate: false,
          missingFromLock: ['echomissioncore'],
          missingFromRuntimeLock: ['echomissioncore']
        }
      }))

      expect(result.report.publishingReady).toBe(false)
      expect(result.report.issues.some((issue) => issue.message === 'ECHO module lock is stale or incomplete.')).toBe(true)
      expect(result.report.issues.find((issue) => issue.message === 'ECHO module lock is stale or incomplete.')?.level).toBe('ERROR')
      expect(result.report.issues.some((issue) => issue.message === 'No local artifacts have been built yet.')).toBe(false)
      expect((result.releaseIndexPreview as { validation?: string }).validation).toBe('rejected')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
