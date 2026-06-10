import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setConfig } from '../../main/config'
import { listEchoModules } from '../../main/moduleCatalogService'
import { findEchoModule } from '../moduleCatalog'

const mockState = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockState.userDataDir
  }
}))

async function writeModuleIndex(root: string, moduleId: string): Promise<string> {
  const indexPath = path.join(root, 'metadata', 'modules', 'index.json')
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify({
    schemaVersion: 'echo.modules.index.v1',
    generatedAt: '2026-06-10T00:00:00.000Z',
    moduleCount: 1,
    modules: [{
      id: moduleId,
      name: moduleId === 'echoweathercore' ? 'ECHO: WeatherCore' : 'ECHO: SignalCore',
      version: '1.0.0',
      kind: 'library',
      role: 'world',
      channel: 'alpha',
      moduleDir: `modules/${moduleId}`,
      descriptorPath: `modules/${moduleId}/echo.module.json`,
      provides: [`${moduleId}.api`],
      requires: ['echocore'],
      runtimes: ['neoforge']
    }]
  }, null, 2), 'utf8')
  return indexPath
}

describe('module catalog service', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-studio-modules-'))
    mockState.userDataDir = path.join(root, 'user-data')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('prefers the configured ECHO-Modules checkout root', async () => {
    const modulesRoot = path.join(root, 'ECHO-Modules')
    const indexPath = await writeModuleIndex(modulesRoot, 'echoweathercore')
    await setConfig({ moduleCatalog: { moduleRoot: modulesRoot, indexPath: '' } })

    const result = await listEchoModules(path.join(root, 'workspace', 'project'))
    const module = findEchoModule('echo:weather_core', result.catalog)

    expect(result.source).toBe('local-index')
    expect(result.moduleRoot).toBe(path.resolve(modulesRoot))
    expect(result.indexPath).toBe(path.resolve(indexPath))
    expect(module?.source).toBe('local-index')
    expect(module?.moduleDir).toBe(path.resolve(modulesRoot, 'modules/echoweathercore'))
    expect(result.warnings).toEqual([])
  })

  it('uses a configured index path override before root autodetection', async () => {
    const customRoot = path.join(root, 'custom-modules')
    const indexPath = await writeModuleIndex(customRoot, 'echosignalcore')
    await setConfig({ moduleCatalog: { moduleRoot: '', indexPath } })

    const result = await listEchoModules(path.join(root, 'workspace', 'project'))
    const module = findEchoModule('echo:signal_core', result.catalog)

    expect(result.source).toBe('local-index')
    expect(result.moduleRoot).toBe(path.resolve(customRoot))
    expect(result.indexPath).toBe(path.resolve(indexPath))
    expect(module?.source).toBe('local-index')
  })
})
