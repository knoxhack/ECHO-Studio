import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
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

describe('packageAddon', () => {
  it('writes SDK-validated release artifacts and sidecars', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-addon-package-'))
    try {
      const project = path.join(root, 'project')
      await fs.mkdir(project, { recursive: true })
      await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest(), null, 2), 'utf8')
      await fs.mkdir(path.join(project, 'assets'), { recursive: true })
      await fs.writeFile(path.join(project, 'assets', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

      const { packageAddon } = await import('../../main/packageService')
      const result = await packageAddon(project)
      const assetNames = result.assetPaths.map((assetPath) => path.basename(assetPath)).sort()

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
        schemaVersion: 1,
        id: 'weather_pack',
        kind: 'addon',
        version: '1.0.0',
        channel: 'alpha',
        publisher: 'teamnova',
        dependencies: [{ id: 'echo:core', kind: 'module', version: '*' }],
        compatibility: ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition']
      })
      expect(releaseManifest.assets.map((asset: { name: string }) => asset.name).sort()).toEqual(assetNames)
      const draft = JSON.parse(await fs.readFile(result.releaseDraftPath ?? '', 'utf8'))
      expect(draft.assets).toHaveLength(7)
      expect(draft.assets.map((asset: { name: string }) => asset.name)).toContain('echo-release.json')
      expect(draft.assets.every((asset: { sha256?: string }) => /^[a-f0-9]{64}$/i.test(asset.sha256 ?? ''))).toBe(true)
      expect(draft.assets.find((asset: { name: string }) => asset.name === 'checksums.sha256')?.sha256).toMatch(/^[a-f0-9]{64}$/i)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
