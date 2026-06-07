import { describe, it, expect } from 'vitest'
import { runProjectCheck } from '../projectValidation'
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
})
