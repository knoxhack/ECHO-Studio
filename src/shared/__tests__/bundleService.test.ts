import { describe, it, expect } from 'vitest'
import { computeLoadOrder } from '../../main/bundleService'
import type { AddonManifest } from '../types'

function makeManifest(id: string, deps: string[] = []): AddonManifest {
  return {
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    description: 'Test',
    developerType: 'addon_developer',
    publisher: { id: 'test', name: 'Test', type: 'creator' },
    projectClass: 'gameplay_addon',
    namespace: 'test',
    target: { experiences: ['ashfall'], modules: [] },
    runtime: { supports: ['neoforge'], nativeReadiness: 'none', minimumEchoSdk: '1.4.0' },
    permissions: [],
    dependencies: { required: deps, optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community' },
    tags: []
  }
}

describe('computeLoadOrder', () => {
  it('returns empty for no manifests', () => {
    const result = computeLoadOrder([])
    expect(result.order).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('returns single manifest', () => {
    const result = computeLoadOrder([makeManifest('a')])
    expect(result.order).toEqual(['a'])
  })

  it('orders dependencies first', () => {
    const a = makeManifest('a', ['b'])
    const b = makeManifest('b')
    const result = computeLoadOrder([a, b])
    expect(result.order).toEqual(['b', 'a'])
  })

  it('warns on circular dependency', () => {
    const a = makeManifest('a', ['b'])
    const b = makeManifest('b', ['a'])
    const result = computeLoadOrder([a, b])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('Circular dependency')
  })
})
