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
    description: 'A test addon package for dev workspace setup.',
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

async function withProject(run: (project: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-dev-workspace-'))
  try {
    const project = path.join(root, 'project')
    await fs.mkdir(project, { recursive: true })
    await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest(), null, 2), 'utf8')
    await run(project)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('setupDevWorkspace', () => {
  it('keeps visual mode lightweight and does not generate Gradle files', async () => {
    await withProject(async (project) => {
      const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
      const result = await setupDevWorkspace(project, {
        mode: 'visual',
        runtimes: ['echo_native'],
        force: false
      })

      expect(result.state.mode).toBe('visual')
      expect(result.state.ready).toBe(true)
      expect(result.state.gradleReady).toBe(false)
      expect(result.state.files.find((file) => file.path === 'build.gradle')?.expected).toBe(false)
      await expect(fs.access(path.join(project, 'build.gradle'))).rejects.toThrow()
    })
  })

  it('generates Gradle files and source scaffolding in Gradle mode', async () => {
    await withProject(async (project) => {
      const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
      const result = await setupDevWorkspace(project, {
        mode: 'gradle',
        runtimes: ['neoforge'],
        force: false
      })

      expect(result.state.mode).toBe('gradle')
      expect(result.state.ready).toBe(true)
      expect(result.state.gradleReady).toBe(true)
      expect(result.state.sourceReady).toBe(true)
      expect(result.state.files.find((file) => file.path === 'META-INF/echo-addon-package.json')?.expected).toBe(false)
      await expect(fs.access(path.join(project, 'build.gradle'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(project, 'META-INF', 'echo-addon-package.json'))).rejects.toThrow()

      const gradleProperties = await fs.readFile(path.join(project, 'gradle.properties'), 'utf8')
      const gradlewBat = await fs.readFile(path.join(project, 'gradlew.bat'), 'utf8')
      const gradlewSh = await fs.readFile(path.join(project, 'gradlew'), 'utf8')
      expect(gradleProperties).toContain('echo_gradle_version=9.1.0')
      expect(gradlewBat).toContain('https://services.gradle.org/distributions/gradle-9.1.0-bin.zip')
      expect(gradlewBat).toContain('.gradle\\studio')
      expect(gradlewBat).not.toContain('where gradle')
      expect(gradlewSh).toContain('https://services.gradle.org/distributions/gradle-9.1.0-bin.zip')
      expect(gradlewSh).toContain('.gradle/studio')
      expect(gradlewSh).not.toContain('command -v gradle')
    })
  })

  it('adds release scaffolding in full mode', async () => {
    await withProject(async (project) => {
      const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
      const result = await setupDevWorkspace(project, {
        mode: 'full',
        runtimes: ['neoforge', 'echo_native', 'standalone'],
        force: false
      })

      expect(result.state.mode).toBe('full')
      expect(result.state.ready).toBe(true)
      expect(result.state.files.find((file) => file.path === 'META-INF/echo-addon-package.json')?.expected).toBe(true)
      expect(result.state.files.find((file) => file.path === '.echo-studio/release-checklist.md')?.expected).toBe(true)
      await expect(fs.access(path.join(project, 'META-INF', 'echo-addon-package.json'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(project, '.echo-studio', 'release-checklist.md'))).resolves.toBeUndefined()
    })
  })

  it('discovers packaged release artifacts from exports', async () => {
    await withProject(async (project) => {
      const exportsDir = path.join(project, 'exports')
      await fs.mkdir(exportsDir, { recursive: true })
      await fs.writeFile(path.join(exportsDir, 'weather_pack-1.0.0.echo-addon'), 'addon', 'utf8')
      await fs.writeFile(path.join(exportsDir, 'echo-release.json'), '{}', 'utf8')
      await fs.writeFile(path.join(exportsDir, 'checksums.sha256'), 'hash  file', 'utf8')

      const { inspectDevWorkspace } = await import('../../main/devWorkspaceService')
      const state = await inspectDevWorkspace(project)

      expect(state.artifacts.map((artifact) => artifact.name)).toEqual(expect.arrayContaining([
        'weather_pack-1.0.0.echo-addon',
        'echo-release.json',
        'checksums.sha256'
      ]))
      expect(state.artifacts.find((artifact) => artifact.name.endsWith('.echo-addon'))?.kind).toBe('echo-addon')
      expect(state.artifacts.find((artifact) => artifact.name === 'echo-release.json')?.kind).toBe('manifest')
      expect(state.artifacts.find((artifact) => artifact.name === 'checksums.sha256')?.kind).toBe('checksum')
    })
  })
})
