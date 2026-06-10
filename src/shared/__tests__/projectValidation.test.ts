import { describe, it, expect } from 'vitest'
import { runProjectCheck } from '../projectValidation'
import type { DevWorkspaceState } from '../devWorkspace'
import type { AddonManifest } from '../types'

function makeManifest(overrides?: Partial<AddonManifest>): AddonManifest {
  return {
    schemaVersion: 1,
    id: 'teamnova:test_addon',
    name: 'Test Addon',
    version: '0.1.0',
    description: 'A test addon for unit tests.',
    developerType: 'addon_developer',
    publisher: { id: 'teamnova', name: 'Team Nova', type: 'team' },
    projectClass: 'gameplay_addon',
    namespace: 'teamnova',
    target: { experiences: ['ashfall'], modules: [] },
    runtime: { supports: ['neoforge'], nativeReadiness: 'none', minimumEchoSdk: '1.4.0' },
    permissions: ['mission.register'],
    dependencies: { required: ['echo:core', 'echo:mission_core'], optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community', issues: 'https://example.com/issues' },
    tags: ['test'],
    ...overrides
  } as AddonManifest
}

function makeDevWorkspace(artifacts: DevWorkspaceState['artifacts']): DevWorkspaceState {
  return {
    ready: true,
    mode: 'full',
    projectPath: 'C:\\test\\project',
    gradleReady: true,
    hasGradleWrapper: true,
    sourceReady: true,
    runtimeTargets: ['neoforge'],
    files: [],
    modulePlan: {
      declared: [],
      normalizedDeclared: [],
      enabled: [],
      unknown: [],
      missingRequired: [],
      optionalAvailable: [],
      closure: []
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
      lockedProjectId: 'teamnova:test_addon',
      lockedProjectVersion: '0.1.0',
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
    artifacts,
    lastSetupAt: '2026-06-09T00:00:00.000Z'
  }
}

describe('runProjectCheck', () => {
  it('passes with no content', () => {
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {},
      langKeys: [],
      assetFiles: []
    })
    expect(report.counts.ERROR).toBe(0)
    expect(report.counts.BLOCKER).toBe(0)
  })

  it('detects duplicate content IDs', () => {
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {
        mission: [
          { id: 'teamnova:duplicate', data: { id: 'teamnova:duplicate', name: 'A', description: '', rewards: [], objective: { type: 'collect', target: '', count: 1 } } },
          { id: 'teamnova:duplicate', data: { id: 'teamnova:duplicate', name: 'B', description: '', rewards: [], objective: { type: 'collect', target: '', count: 1 } } }
        ]
      },
      langKeys: [],
      assetFiles: []
    })
    expect(report.issues.some((i) => i.message.includes('Duplicate content ID'))).toBe(true)
  })

  it('warns about missing unlock mission', () => {
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {
        mission: [
          { id: 'teamnova:m1', data: { id: 'teamnova:m1', name: 'M1', description: '', rewards: [], objective: { type: 'collect', target: '', count: 1 }, unlockAfter: 'teamnova:missing' } }
        ]
      },
      langKeys: [],
      assetFiles: []
    })
    expect(report.issues.some((i) => i.message.includes('unlock condition points to missing mission'))).toBe(true)
  })

  it('warns about mission with no reward', () => {
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {
        mission: [
          { id: 'teamnova:m1', data: { id: 'teamnova:m1', name: 'M1', description: '', rewards: [], objective: { type: 'collect', target: '', count: 1 } } }
        ]
      },
      langKeys: [],
      assetFiles: []
    })
    expect(report.issues.some((i) => i.message.includes('no reward'))).toBe(true)
  })

  it('detects recipe cycle', () => {
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {
        recipe: [
          { id: 'teamnova:r1', data: { id: 'teamnova:r1', name: 'R1', description: '', inputs: [{ item: 'teamnova:a', count: 1 }], output: { item: 'teamnova:b', count: 1 }, indexEntry: '' } },
          { id: 'teamnova:r2', data: { id: 'teamnova:r2', name: 'R2', description: '', inputs: [{ item: 'teamnova:b', count: 1 }], output: { item: 'teamnova:a', count: 1 }, indexEntry: '' } }
        ]
      },
      langKeys: [],
      assetFiles: []
    })
    expect(report.issues.some((i) => i.message.includes('Circular recipe dependency'))).toBe(true)
  })

  it('treats packaged exports with release sidecars as release-ready artifacts', () => {
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {},
      langKeys: [],
      assetFiles: [],
      devWorkspace: makeDevWorkspace([
        {
          path: 'C:\\test\\project\\exports\\weather_pack-1.0.0.echo-addon',
          name: 'weather_pack-1.0.0.echo-addon',
          kind: 'echo-addon',
          bytes: 4,
          modifiedAt: 1
        },
        {
          path: 'C:\\test\\project\\exports\\echo-release.json',
          name: 'echo-release.json',
          kind: 'manifest',
          bytes: 2,
          modifiedAt: 1
        },
        {
          path: 'C:\\test\\project\\exports\\checksums.sha256',
          name: 'checksums.sha256',
          kind: 'checksum',
          bytes: 10,
          modifiedAt: 1
        }
      ])
    })

    expect(report.issues.some((i) => i.message === 'No local artifacts have been built yet.')).toBe(false)
    expect(report.issues.some((i) => i.message === 'Built artifacts are missing echo-release.json or checksums.sha256.')).toBe(false)
  })

  it('warns when the ECHO module lock is stale', () => {
    const workspace = makeDevWorkspace([])
    workspace.moduleLock = {
      ...workspace.moduleLock,
      upToDate: false,
      runtimeUpToDate: false,
      missingFromLock: ['echomissioncore'],
      missingFromRuntimeLock: ['echomissioncore']
    }
    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {},
      langKeys: [],
      assetFiles: [],
      devWorkspace: workspace
    })

    expect(report.issues.some((i) => i.message === 'ECHO module lock is stale or incomplete.')).toBe(true)
    expect(report.issues.find((i) => i.message === 'ECHO module lock is stale or incomplete.')?.level).toBe('ERROR')
    expect(report.issues.find((i) => i.message === 'ECHO module lock is stale or incomplete.')?.fix).toContain('echomissioncore')
  })

  it('warns when selected preview runtimes are missing generated executable paths', () => {
    const workspace = makeDevWorkspace([])
    workspace.runtimeTargets = ['echo_native', 'standalone']
    workspace.runtimeLaunchers = {
      ...workspace.runtimeLaunchers,
      nativeExpected: true,
      standaloneExpected: true,
      ready: false
    }

    const report = runProjectCheck({
      manifest: makeManifest(),
      content: {},
      langKeys: [],
      assetFiles: [],
      devWorkspace: workspace
    })

    expect(report.issues.some((i) => i.message === 'ECHO Native preview executable is not configured in the generated workspace.')).toBe(true)
    expect(report.issues.some((i) => i.message === 'Standalone preview executable is not configured in the generated workspace.')).toBe(true)
    expect(report.issues.find((i) => i.message.includes('ECHO Native preview executable'))?.file).toBe('gradle.properties')
  })
})
