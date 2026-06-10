import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig, setConfig } from '../../main/config'

const mockState = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockState.userDataDir
  }
}))

async function writeRawConfig(value: unknown): Promise<void> {
  await fs.mkdir(mockState.userDataDir, { recursive: true })
  await fs.writeFile(path.join(mockState.userDataDir, 'config.json'), JSON.stringify(value, null, 2), 'utf8')
}

async function readRawConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(mockState.userDataDir, 'config.json'), 'utf8')) as Record<string, unknown>
}

describe('config service', () => {
  beforeEach(async () => {
    mockState.userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-studio-config-'))
  })

  afterEach(async () => {
    await fs.rm(mockState.userDataDir, { recursive: true, force: true })
  })

  it('migrates legacy sandbox profile settings into preview config', async () => {
    await writeRawConfig({
      sandbox: {
        defaultProfile: 'ECHO Prime Sandbox'
      }
    })

    const config = await getConfig()

    expect(config.preview.defaultProfile).toBe('ECHO Prime Compatibility')
    expect('sandbox' in config).toBe(false)
  })

  it('writes preview config without resurrecting legacy sandbox settings', async () => {
    await writeRawConfig({
      sandbox: {
        defaultProfile: 'Server Sandbox'
      }
    })

    await setConfig({ preview: { defaultProfile: 'Server Compatibility' } })
    const raw = await readRawConfig()

    expect(raw.preview).toEqual({ defaultProfile: 'Server Compatibility' })
    expect(raw.sandbox).toBeUndefined()
  })

  it('persists local ECHO-Modules catalog settings', async () => {
    await setConfig({
      moduleCatalog: {
        moduleRoot: 'C:\\Development\\Github\\ECHO-Modules',
        indexPath: 'C:\\Development\\Github\\ECHO-Modules\\metadata\\modules\\index.json'
      }
    })

    const config = await getConfig()
    const raw = await readRawConfig()

    expect(config.moduleCatalog).toEqual({
      moduleRoot: 'C:\\Development\\Github\\ECHO-Modules',
      indexPath: 'C:\\Development\\Github\\ECHO-Modules\\metadata\\modules\\index.json'
    })
    expect(raw.moduleCatalog).toEqual(config.moduleCatalog)
  })
})
