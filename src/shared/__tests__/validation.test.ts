import { describe, it, expect } from 'vitest'
import { autoFixManifest, runPackOSCheck, runValidationCheck } from '../validation'
import { ECHO_MODULE_CATALOG, mergeModuleCatalog, moduleFromIndexEntry, type EchoModuleRecord } from '../moduleCatalog'
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

describe('runValidationCheck', () => {
  it('passes a clean manifest with no issues', () => {
    const manifest = makeManifest()
    const report = runValidationCheck(manifest)
    expect(report.counts.BLOCKER).toBe(0)
    expect(report.counts.ERROR).toBe(0)
    expect(report.compatibilityScore).toBeGreaterThan(80)
    expect(report.publishingReady).toBe(true)
  })

  it('flags reserved namespace as BLOCKER', () => {
    const manifest = makeManifest({ namespace: 'echo', id: 'echo:bad_addon' })
    const report = runValidationCheck(manifest)
    expect(report.counts.BLOCKER).toBeGreaterThanOrEqual(1)
    expect(report.issues.some((i) => i.message.includes('reserved namespace'))).toBe(true)
  })

  it('flags blocked permissions', () => {
    const manifest = makeManifest({ permissions: ['file_system.write_global'] })
    const report = runValidationCheck(manifest)
    expect(report.counts.BLOCKER).toBeGreaterThanOrEqual(1)
    expect(report.issues.some((i) => i.message.includes('Restricted permission'))).toBe(true)
  })

  it('blocks current and legacy validation policy permissions', () => {
    const current = runValidationCheck(makeManifest({ permissions: ['validation.policy.modify'] }))
    const legacy = runValidationCheck(makeManifest({ permissions: ['packos.policy.modify'] }))

    expect(current.counts.BLOCKER).toBeGreaterThanOrEqual(1)
    expect(legacy.counts.BLOCKER).toBeGreaterThanOrEqual(1)
    expect(autoFixManifest(makeManifest({ permissions: ['validation.policy.modify'] })).permissions).toEqual(['addon_storage.write'])
    expect(autoFixManifest(makeManifest({ permissions: ['packos.policy.modify'] })).permissions).toEqual(['addon_storage.write'])
  })

  it('flags missing echo:core dependency as ERROR', () => {
    const manifest = makeManifest({ dependencies: { required: [], optional: [] } })
    const report = runValidationCheck(manifest)
    expect(report.counts.ERROR).toBeGreaterThanOrEqual(1)
    expect(report.issues.some((i) => i.message.includes('echo:core'))).toBe(true)
  })

  it('flags missing mission_core when mission.register is used', () => {
    const manifest = makeManifest({
      permissions: ['mission.register'],
      dependencies: { required: ['echo:core'], optional: [] }
    })
    const report = runValidationCheck(manifest)
    expect(report.issues.some((i) => i.message.includes('MissionCore'))).toBe(true)
  })

  it('flags bad version as WARNING', () => {
    const manifest = makeManifest({ version: 'v1' })
    const report = runValidationCheck(manifest)
    expect(report.counts.WARNING).toBeGreaterThanOrEqual(1)
    expect(report.issues.some((i) => i.message.includes('semantic versioning'))).toBe(true)
  })

  it('blocks releases that depend on a blocked ECHO module', () => {
    const blockedModule: EchoModuleRecord = {
      id: 'echounsafe',
      aliases: ['echo:unsafe'],
      name: 'Unsafe',
      role: 'test',
      kind: 'library',
      status: 'experimental',
      channel: 'alpha',
      standaloneReady: false,
      launcherVisible: false,
      ashfallRequired: false,
      publicApi: 'experimental',
      trustLevel: 'blocked',
      blocked: true,
      blockReason: 'Security review failed.',
      requires: ['echocore'],
      optional: [],
      provides: [],
      runtimes: ['neoforge'],
      creatorUse: 'Blocked test module.'
    }
    const manifest = makeManifest({
      dependencies: { required: ['echo:core', 'echo:unsafe'], optional: [] },
      target: { experiences: ['ashfall'], modules: ['echo:unsafe'] }
    })
    const report = runValidationCheck(manifest, [...ECHO_MODULE_CATALOG, blockedModule])

    expect(report.counts.BLOCKER).toBeGreaterThanOrEqual(1)
    expect(report.publishingReady).toBe(false)
    expect(report.issues.some((issue) => issue.message.includes('Unsafe is blocked'))).toBe(true)
    expect(report.issues.find((issue) => issue.message.includes('Unsafe is blocked'))?.fix).toBe('Security review failed.')
  })

  it('keeps the legacy runPackOSCheck alias for older callers', () => {
    expect(runPackOSCheck(makeManifest()).compatibilityScore).toBe(runValidationCheck(makeManifest()).compatibilityScore)
  })
})

describe('autoFixManifest', () => {
  it('fixes reserved namespace', () => {
    const manifest = makeManifest({ namespace: 'echo', id: 'echo:bad_addon' })
    const fixed = autoFixManifest(manifest)
    expect(fixed.namespace).not.toBe('echo')
    expect(fixed.id.startsWith('echo:')).toBe(false)
  })

  it('adds missing echo:core dependency', () => {
    const manifest = makeManifest({ dependencies: { required: [], optional: [] } })
    const fixed = autoFixManifest(manifest)
    expect(fixed.dependencies.required).toContain('echo:core')
  })

  it('adds the full ECHO module closure when fixing missing module dependencies', () => {
    const manifest = makeManifest({
      permissions: ['mission.register'],
      dependencies: { required: ['echo:core'], optional: [] },
      target: { experiences: ['ashfall'], modules: [] }
    })
    const fixed = autoFixManifest(manifest)

    expect(fixed.dependencies.required).toEqual(expect.arrayContaining([
      'echo:adapter_core',
      'echo:core',
      'echo:net_core',
      'echo:mission_core'
    ]))
    expect(fixed.target.modules).toEqual(expect.arrayContaining([
      'echo:adapter_core',
      'echo:net_core',
      'echo:mission_core'
    ]))
  })

  it('uses imported local catalog dependencies when fixing module closure', () => {
    const catalog = mergeModuleCatalog([
      moduleFromIndexEntry({
        id: 'echomissioncore',
        name: 'ECHO: MissionCore',
        channel: 'beta',
        requires: ['echocore', 'echonetcore', 'echoweathercore']
      }),
      moduleFromIndexEntry({
        id: 'echoweathercore',
        name: 'ECHO: WeatherCore',
        channel: 'beta',
        requires: ['echocore'],
        provides: ['weather.events']
      })
    ], ECHO_MODULE_CATALOG)
    const manifest = makeManifest({
      permissions: ['mission.register'],
      dependencies: { required: ['echo:core'], optional: [] },
      target: { experiences: ['ashfall'], modules: [] }
    })
    const fixed = autoFixManifest(manifest, catalog)

    expect(fixed.dependencies.required).toContain('echo:weather_core')
    expect(fixed.target.modules).toContain('echo:weather_core')
  })

  it('adds default tags if missing', () => {
    const manifest = makeManifest({ tags: [] })
    const fixed = autoFixManifest(manifest)
    expect((fixed.tags ?? []).length).toBeGreaterThan(0)
  })
})
