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
      expect(result.state.files.find((file) => file.path === '.echo-studio/modules.lock.json')?.expected).toBe(true)
      expect(result.state.files.find((file) => file.path === 'src/generated/resources/META-INF/neoforge.mods.toml')?.expected).toBe(false)
      await expect(fs.access(path.join(project, '.echo-studio', 'modules.lock.json'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(project, 'src', 'generated', 'resources', 'META-INF', 'neoforge.mods.toml'))).rejects.toThrow()
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

      const moduleLock = JSON.parse(await fs.readFile(path.join(project, '.echo-studio', 'modules.lock.json'), 'utf8'))
      const runtimeModuleLock = JSON.parse(await fs.readFile(path.join(project, 'src', 'generated', 'resources', 'META-INF', 'echo.modules.lock.json'), 'utf8'))
      const neoforgeToml = await fs.readFile(path.join(project, 'src', 'generated', 'resources', 'META-INF', 'neoforge.mods.toml'), 'utf8')
      expect(result.state.files.find((file) => file.path === 'src/generated/resources/META-INF/echo.modules.lock.json')?.expected).toBe(true)
      expect(result.state.files.find((file) => file.path === 'src/generated/resources/META-INF/neoforge.mods.toml')?.expected).toBe(true)
      expect(moduleLock.schemaVersion).toBe('echo.studio.modules.lock.v1')
      expect(moduleLock.project).toEqual({ id: 'teamnova:weather_pack', version: '1.0.0' })
      expect(moduleLock.declared).toContain('echo:core')
      expect(moduleLock.modules.some((mod: { id: string }) => mod.id === 'echocore')).toBe(true)
      expect(runtimeModuleLock.modules.map((mod: { id: string }) => mod.id)).toEqual(moduleLock.modules.map((mod: { id: string }) => mod.id))
      expect(result.state.moduleLock).toMatchObject({
        schemaVersion: 'echo.studio.modules.lock.status.v1',
        studioExists: true,
        runtimeExists: true,
        runtimeExpected: true,
        upToDate: true,
        runtimeUpToDate: true,
        projectMatches: true,
        expectedModuleIds: ['echocore'],
        lockedModuleIds: ['echocore'],
        runtimeModuleIds: ['echocore']
      })
      expect(neoforgeToml).toContain('# Generated by ECHO Studio')
      expect(neoforgeToml).toContain('modLoader="javafml"')
      expect(neoforgeToml).toContain('modId="weather_pack"')
      expect(neoforgeToml).toContain('displayName="Weather Pack"')

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

  it('marks the module lock stale when manifest dependencies change after setup', async () => {
    await withProject(async (project) => {
      const { inspectDevWorkspace, setupDevWorkspace } = await import('../../main/devWorkspaceService')
      await setupDevWorkspace(project, {
        mode: 'gradle',
        runtimes: ['neoforge'],
        force: false
      })

      const next = manifest()
      next.target.modules = ['echo:mission_core']
      next.dependencies.required = ['echo:core', 'echo:mission_core']
      await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(next, null, 2), 'utf8')

      const state = await inspectDevWorkspace(project)

      expect(state.ready).toBe(false)
      expect(state.moduleLock.upToDate).toBe(false)
      expect(state.moduleLock.missingFromLock).toEqual(expect.arrayContaining(['echomissioncore']))
      expect(state.moduleLock.runtimeUpToDate).toBe(false)
      expect(state.modulePlan.closure.map((mod) => mod.id)).toEqual(expect.arrayContaining(['echomissioncore']))
    })
  })

  it('adds release scaffolding in full mode', async () => {
    await withProject(async (project) => {
      const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
      const result = await setupDevWorkspace(project, {
        mode: 'full',
        runtimes: ['neoforge', 'echo_native', 'standalone'],
        runtimeTools: {
          echoNativeExecutable: 'C:\\ECHO Runtime\\echo-native.exe',
          standaloneExecutable: 'C:\\ECHO Runtime\\echo-standalone.exe'
        },
        force: false
      })

      expect(result.state.mode).toBe('full')
      expect(result.state.ready).toBe(true)
      expect(result.state.files.find((file) => file.path === 'META-INF/echo-addon-package.json')?.expected).toBe(true)
      expect(result.state.files.find((file) => file.path === '.echo-studio/release-checklist.md')?.expected).toBe(true)
      await expect(fs.access(path.join(project, 'META-INF', 'echo-addon-package.json'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(project, '.echo-studio', 'release-checklist.md'))).resolves.toBeUndefined()

      const gradleProperties = await fs.readFile(path.join(project, 'gradle.properties'), 'utf8')
      const buildGradle = await fs.readFile(path.join(project, 'build.gradle'), 'utf8')
      expect(gradleProperties).toContain('echo_native_executable=C:/ECHO Runtime/echo-native.exe')
      expect(gradleProperties).toContain('echo_standalone_executable=C:/ECHO Runtime/echo-standalone.exe')
      expect(buildGradle).toContain('tasks.register("echoNativePreview", Exec)')
      expect(buildGradle).toContain('tasks.register("echoStandalonePreview", Exec)')
      expect(buildGradle).toContain('--modules-lock')
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
