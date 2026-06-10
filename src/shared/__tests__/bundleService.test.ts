import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { describe, it, expect, vi } from 'vitest'
import { computeLoadOrder, summarizeBundleModules } from '../bundles'
import { ECHO_MODULE_CATALOG, mergeModuleCatalog, moduleFromIndexEntry } from '../moduleCatalog'
import type { AddonManifest } from '../types'
import { createExperience, exportServerPack } from '../../main/bundleService'

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir()
  }
}))

function makeManifest(id: string, deps: string[] = [], permissions: string[] = []): AddonManifest {
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
    permissions,
    dependencies: { required: deps, optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community' },
    tags: []
  }
}

async function writeLocalModuleIndex(root: string): Promise<void> {
  const indexPath = path.join(root, 'ECHO-Modules', 'metadata', 'modules', 'index.json')
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify({
    schemaVersion: 'echo.modules.index.v1',
    generatedAt: '2026-06-10T00:00:00.000Z',
    modules: [
      {
        id: 'echocore',
        name: 'ECHO: Core',
        channel: 'alpha',
        provides: ['echo:core']
      }
    ]
  }, null, 2), 'utf8')
}

async function writeProject(workspace: string, folder: string, manifest: AddonManifest): Promise<string> {
  const project = path.join(workspace, folder)
  await fs.mkdir(project, { recursive: true })
  await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return project
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

describe('summarizeBundleModules', () => {
  it('resolves bundle module closure through the active catalog', () => {
    const catalog = mergeModuleCatalog([
      moduleFromIndexEntry({
        id: 'echomissioncore',
        name: 'ECHO: MissionCore',
        channel: 'beta',
        requires: ['echocore', 'echoweathercore']
      }),
      moduleFromIndexEntry({
        id: 'echoweathercore',
        name: 'ECHO: WeatherCore',
        channel: 'beta',
        moduleDir: 'addons/echoweathercore',
        requires: ['echocore'],
        provides: ['weather.events']
      })
    ], ECHO_MODULE_CATALOG)
    const summary = summarizeBundleModules([
      makeManifest('teamnova:missions', ['echo:mission_core'])
    ], catalog)

    expect(summary.modules.map((mod) => mod.alias)).toEqual(expect.arrayContaining([
      'echo:core',
      'echo:mission_core',
      'echo:weather_core'
    ]))
    expect(summary.localModuleCount).toBe(1)
    expect(summary.missingRequired).toContain('echo:weather_core')
    expect(summary.unknown).toEqual([])
    expect(summary.blocked).toEqual([])
  })
})

describe('bundleService pack metadata', () => {
  it('writes canonical echo-pack metadata beside legacy Community Experience files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-bundle-service-'))
    try {
      await writeLocalModuleIndex(root)
      const workspace = path.join(root, 'Workspace')
      const project = await writeProject(
        workspace,
        'teamnova_missions',
        makeManifest('teamnova:missions', ['echo:core'])
      )

      const result = await createExperience(workspace, 'teamnova', 'ashfall_bundle', 'Ashfall Bundle', [project])
      const pack = JSON.parse(await fs.readFile(result.packManifestPath, 'utf8'))
      const lock = JSON.parse(await fs.readFile(result.packLockPath, 'utf8'))
      const legacyLock = JSON.parse(await fs.readFile(result.legacyLockPath, 'utf8'))

      expect(path.basename(result.packManifestPath)).toBe('echo-pack.json')
      expect(path.basename(result.packLockPath)).toBe('echo-pack.lock.json')
      expect(path.basename(result.legacyLockPath)).toBe('packos.lockfile.json')
      expect(pack.schemaVersion).toBe('echo.pack.v1')
      expect(pack.id).toBe('teamnova:ashfall_bundle')
      expect(pack.kind).toBe('community_experience')
      expect(pack.compatibility.targetExperiences).toEqual(['ashfall'])
      expect(pack.moduleClosure.catalogSource).toBe('local-index')
      expect(pack.members[0].manifestSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(lock.schemaVersion).toBe('echo.pack.lock.v1')
      expect(lock.members[0].sourcePath).toBe(project)
      expect(legacyLock.schemaVersion).toBe(1)
      await expect(fs.access(path.join(result.path, 'experience.json'))).resolves.toBeUndefined()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('embeds canonical echo-pack metadata in exported Server Pack zips', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-bundle-service-'))
    try {
      await writeLocalModuleIndex(root)
      const workspace = path.join(root, 'Workspace')
      const project = await writeProject(
        workspace,
        'teamnova_missions',
        makeManifest('teamnova:missions', ['echo:core'], ['mission.register'])
      )

      const result = await exportServerPack(workspace, 'Ashfall Server', [project])
      const zip = new AdmZip(result.zipPath)
      const pack = JSON.parse(zip.readAsText(result.packManifestFile))
      const lock = JSON.parse(zip.readAsText(result.packLockFile))

      expect(result.packManifestFile).toBe('echo-pack.json')
      expect(result.packLockFile).toBe('echo-pack.lock.json')
      expect(pack.schemaVersion).toBe('echo.pack.v1')
      expect(pack.kind).toBe('server_pack')
      expect(pack.requiredClientAddons).toEqual(['teamnova:missions'])
      expect(pack.moduleClosure.catalogSource).toBe('local-index')
      expect(lock.schemaVersion).toBe('echo.pack.lock.v1')
      expect(zip.getEntry('server.profile.json')).toBeTruthy()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
