import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, vi } from 'vitest'
import { computePreviewScore } from '../previewScan'
import type { AddonManifest, Runtime } from '../types'

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir()
  }
}))

function manifest(overrides?: Partial<AddonManifest>): AddonManifest {
  return {
    schemaVersion: 1,
    id: 'teamnova:weather_pack',
    name: 'Weather Pack',
    version: '1.0.0',
    description: 'A test addon package for preview compatibility testing.',
    developerType: 'addon_developer',
    publisher: { id: 'teamnova', name: 'Team Nova', type: 'team' },
    projectClass: 'gameplay_addon',
    namespace: 'teamnova',
    target: { experiences: ['ashfall', 'generic'], modules: [] },
    runtime: { supports: ['neoforge'] as Runtime[], nativeReadiness: 'partial', minimumEchoSdk: '1.4.0' },
    permissions: ['mission.register'],
    dependencies: { required: ['echo:core'], optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community', issues: 'https://example.com/issues' },
    tags: ['test'],
    ...overrides
  }
}

async function writeProject(root: string, folder: string, addonManifest: AddonManifest): Promise<string> {
  const project = path.join(root, folder)
  await fs.mkdir(project, { recursive: true })
  await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(addonManifest, null, 2), 'utf8')
  return project
}

async function withWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-preview-'))
  try {
    await run(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

const DEFAULT_OPTIONS = {
  loadOnlySelected: false,
  debugOverlay: false,
  fakePlayer: false,
  testInventory: false
}

describe('computePreviewScore', () => {
  it('returns 100 for a perfect run', () => {
    expect(computePreviewScore(0, 0, 0, 0)).toBe(100)
  })

  it('deducts 10 per missing dependency', () => {
    expect(computePreviewScore(2, 0, 0, 0)).toBe(80)
  })

  it('deducts 3 per warning', () => {
    expect(computePreviewScore(0, 5, 0, 0)).toBe(85)
  })

  it('deducts 15 per error', () => {
    expect(computePreviewScore(0, 0, 2, 0)).toBe(70)
  })

  it('deducts 5 per content failure', () => {
    expect(computePreviewScore(0, 0, 0, 4)).toBe(80)
  })

  it('clamps to a minimum of 0', () => {
    expect(computePreviewScore(100, 100, 100, 100)).toBe(0)
  })
})

describe('runPreviewScan', () => {
  it('warns when a standalone compatibility profile is launched for a project without standalone support', async () => {
    await withWorkspace(async (root) => {
      const project = await writeProject(root, 'weather', manifest())
      const { runPreviewScan } = await import('../../main/previewScanService')

      const result = await runPreviewScan(project, root, 'Generic Runtime Compatibility', DEFAULT_OPTIONS)

      expect(result.warnings).toContain('Addon does not declare support for runtime "standalone".')
      expect(result.logs.some((log) => log.message.includes('Runtime mismatch'))).toBe(true)
    })
  })

  it('honors selected-only mode by not resolving sibling workspace dependencies', async () => {
    await withWorkspace(async (root) => {
      const project = await writeProject(root, 'weather', manifest({
        dependencies: { required: ['teamnova:shared_dep'], optional: [] }
      }))
      await writeProject(root, 'shared', manifest({
        id: 'teamnova:shared_dep',
        name: 'Shared Dep',
        dependencies: { required: [], optional: [] }
      }))
      const { runPreviewScan } = await import('../../main/previewScanService')

      const workspaceResult = await runPreviewScan(project, root, 'Ashfall Compatibility', DEFAULT_OPTIONS)
      const selectedOnlyResult = await runPreviewScan(project, root, 'Ashfall Compatibility', {
        ...DEFAULT_OPTIONS,
        loadOnlySelected: true
      })

      expect(workspaceResult.missingDependencies).not.toContain('teamnova:shared_dep')
      expect(selectedOnlyResult.missingDependencies).toContain('teamnova:shared_dep')
      expect(selectedOnlyResult.logs.some((log) => log.message.includes('workspace dependency scan is disabled'))).toBe(true)
    })
  })

  it('reports enabled preview options in compatibility scan logs', async () => {
    await withWorkspace(async (root) => {
      const project = await writeProject(root, 'weather', manifest())
      const { runPreviewScan } = await import('../../main/previewScanService')

      const result = await runPreviewScan(project, root, 'Ashfall Compatibility', {
        loadOnlySelected: false,
        debugOverlay: true,
        fakePlayer: true,
        testInventory: true
      })

      expect(result.logs.map((log) => log.message)).toEqual(expect.arrayContaining([
        'Debug overlay enabled.',
        'Fake player profile enabled.',
        'Test inventory enabled.'
      ]))
    })
  })

  it('accepts legacy sandbox profile names as compatibility aliases', async () => {
    await withWorkspace(async (root) => {
      const project = await writeProject(root, 'weather', manifest())
      const { runSandbox } = await import('../../main/sandboxService')

      const result = await runSandbox(project, root, 'Ashfall Sandbox', DEFAULT_OPTIONS)

      expect(result.errors).toHaveLength(0)
      expect(result.logs.some((log) => log.message.includes('Runtime compatible: neoforge'))).toBe(true)
    })
  })

  it('accepts current public UI and index permissions in runtime profiles', async () => {
    await withWorkspace(async (root) => {
      const project = await writeProject(root, 'weather', manifest({
        permissions: ['mission.register', 'screen.custom_ui', 'index.entries'],
        runtime: { supports: ['neoforge'], nativeReadiness: 'none', minimumEchoSdk: '1.4.0' }
      }))
      const { runPreviewScan } = await import('../../main/previewScanService')

      const result = await runPreviewScan(project, root, 'Ashfall Compatibility', DEFAULT_OPTIONS)

      expect(result.warnings.some((warning) => warning.includes('Unknown permissions'))).toBe(false)
      expect(result.logs.some((log) => log.message.includes('Unknown permissions'))).toBe(false)
    })
  })
})
