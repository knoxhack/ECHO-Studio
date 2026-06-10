import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import { listProjects, readProjectTree, setPublishStatus } from '../../main/fsService'
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
    description: 'A project used to test Studio project metadata.',
    developerType: 'addon_developer',
    publisher: { id: 'teamnova', name: 'Team Nova', type: 'team' },
    projectClass: 'gameplay_addon',
    namespace: 'teamnova',
    target: { experiences: ['ashfall'], modules: [] },
    runtime: { supports: ['neoforge'], nativeReadiness: 'none', minimumEchoSdk: '1.4.0' },
    permissions: ['addon_storage.write'],
    dependencies: { required: ['echo:core'], optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community', issues: 'https://example.com/issues' },
    tags: ['test']
  }
}

describe('fsService project metadata', () => {
  it('reads legacy publish status, writes .echo-studio status, and hides Studio state from the tree', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-fs-service-'))
    try {
      const project = path.join(root, 'teamnova_weather_pack')
      await fs.mkdir(project, { recursive: true })
      await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest(), null, 2), 'utf8')
      await fs.mkdir(path.join(project, '.studio'), { recursive: true })
      await fs.mkdir(path.join(project, '.echo-studio'), { recursive: true })
      await fs.writeFile(path.join(project, '.studio', 'status.json'), JSON.stringify({ publishStatus: 'submitted' }), 'utf8')
      await fs.writeFile(path.join(project, '.echo-studio', 'local.json'), '{}', 'utf8')

      expect((await listProjects(root))[0].publishStatus).toBe('submitted')

      await setPublishStatus(project, 'approved')
      const modernStatus = JSON.parse(await fs.readFile(path.join(project, '.echo-studio', 'status.json'), 'utf8'))
      expect(modernStatus.publishStatus).toBe('approved')
      expect((await listProjects(root))[0].publishStatus).toBe('approved')

      const tree = await readProjectTree(project)
      expect(tree.children?.map((child) => child.name)).not.toContain('.studio')
      expect(tree.children?.map((child) => child.name)).not.toContain('.echo-studio')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
