import { describe, expect, it } from 'vitest'
import {
  ECHO_MODULE_CATALOG,
  findEchoModule,
  getModuleDependencyClosure,
  mergeModuleCatalog,
  moduleFromIndexEntry,
  normalizeModuleId,
  preferredModuleAlias,
  resolveProjectModulePlan
} from '../moduleCatalog'
import type { AddonManifest } from '../types'

function manifest(deps: string[]): AddonManifest {
  return {
    schemaVersion: 1,
    id: 'teamnova:test',
    name: 'Test',
    version: '0.1.0',
    description: 'A test project.',
    developerType: 'addon_developer',
    publisher: { id: 'teamnova', name: 'Team Nova', type: 'team' },
    projectClass: 'gameplay_addon',
    namespace: 'teamnova',
    target: { experiences: ['ashfall'], modules: [] },
    runtime: { supports: ['neoforge'], nativeReadiness: 'none', minimumEchoSdk: '1.4.0' },
    permissions: [],
    dependencies: { required: deps, optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community', issues: 'https://example.com' },
    tags: ['test']
  }
}

describe('module catalog', () => {
  it('normalizes legacy echo:* aliases to canonical module ids', () => {
    expect(normalizeModuleId('echo:mission_core')).toBe('echomissioncore')
    expect(findEchoModule('echo:screen_core')?.id).toBe('echoscreencore')
  })

  it('builds dependency closure from canonical module records', () => {
    const closure = getModuleDependencyClosure(['echomissioncore'])
    expect(closure.map((mod) => mod.id)).toContain('echocore')
    expect(closure.map((mod) => mod.id)).toContain('echomissioncore')
  })

  it('selects the public echo:* alias for manifest writes', () => {
    expect(preferredModuleAlias(findEchoModule('echocore')!)).toBe('echo:core')
    expect(preferredModuleAlias(findEchoModule('echomissioncore')!)).toBe('echo:mission_core')
  })

  it('imports and merges local ECHO-Modules index entries', () => {
    const imported = moduleFromIndexEntry({
      id: 'echoweathercore',
      name: 'ECHO: WeatherCore',
      version: '1.0.0',
      kind: 'addon',
      role: 'world',
      channel: 'beta',
      standalone: true,
      requires: ['echocore', 'echonetcore'],
      optional: ['echoholomap'],
      provides: ['weather.events']
    })
    const catalog = mergeModuleCatalog([imported], ECHO_MODULE_CATALOG)
    expect(findEchoModule('echo:weather_core', catalog)?.id).toBe('echoweathercore')
    expect(findEchoModule('echoweathercore', catalog)?.provides).toContain('weather.events')
    expect(preferredModuleAlias(findEchoModule('echoweathercore', catalog)!)).toBe('echo:weather_core')
  })

  it('preserves trust and blocked metadata from local ECHO-Modules index entries', () => {
    const imported = moduleFromIndexEntry({
      id: 'echounsafe',
      name: 'ECHO: Unsafe',
      channel: 'beta',
      trustLevel: 'blocked',
      blocked: true,
      blockReason: 'Security review failed.',
      requires: ['echocore']
    })

    expect(imported.trustLevel).toBe('blocked')
    expect(imported.blocked).toBe(true)
    expect(imported.blockReason).toBe('Security review failed.')
  })

  it('resolves project module plans against an imported catalog', () => {
    const imported = moduleFromIndexEntry({
      id: 'echoweathercore',
      name: 'ECHO: WeatherCore',
      role: 'world',
      channel: 'beta',
      standalone: true,
      requires: ['echocore', 'echonetcore']
    })
    const catalog = mergeModuleCatalog([imported], ECHO_MODULE_CATALOG)
    const plan = resolveProjectModulePlan(manifest(['echo:weather_core']), catalog)
    expect(plan.enabled.map((mod) => mod.id)).toContain('echoweathercore')
    expect(plan.missingRequired.map((mod) => mod.id)).toEqual(expect.arrayContaining(['echocore', 'echonetcore']))
  })
})
