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
      expect(result.state.runtimeLaunchers).toMatchObject({
        schemaVersion: 'echo.studio.runtime.launchers.status.v1',
        gradlePropertiesExists: false,
        nativeExpected: false,
        standaloneExpected: false,
        ready: true
      })
      expect(result.state.moduleCatalog.schemaVersion).toBe('echo.studio.modules.catalog.status.v1')
      expect(result.state.files.find((file) => file.path === 'build.gradle')?.expected).toBe(false)
      expect(result.state.files.find((file) => file.path === '.echo-studio/modules.lock.json')?.expected).toBe(true)
      expect(result.state.files.find((file) => file.path === '.echo-studio/module-workspace.json')?.expected).toBe(true)
      expect(result.state.moduleWorkspace).toMatchObject({
        schemaVersion: 'echo.studio.modules.workspace.status.v1',
        exists: true,
        upToDate: true,
        path: '.echo-studio/module-workspace.json'
      })
      expect(result.state.files.find((file) => file.path === 'src/generated/resources/META-INF/neoforge.mods.toml')?.expected).toBe(false)
      await expect(fs.access(path.join(project, '.echo-studio', 'modules.lock.json'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(project, '.echo-studio', 'module-workspace.json'))).resolves.toBeUndefined()
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
      expect(result.state.runtimeLaunchers).toMatchObject({
        gradlePropertiesExists: true,
        nativeExpected: false,
        standaloneExpected: false,
        ready: true
      })
      expect(result.state.moduleCatalog).toMatchObject({
        schemaVersion: 'echo.studio.modules.catalog.status.v1',
        localAvailable: expect.any(Boolean)
      })
      expect(result.state.files.find((file) => file.path === 'META-INF/echo-addon-package.json')?.expected).toBe(false)
      await expect(fs.access(path.join(project, 'build.gradle'))).resolves.toBeUndefined()
      await expect(fs.access(path.join(project, 'META-INF', 'echo-addon-package.json'))).rejects.toThrow()

      const moduleLock = JSON.parse(await fs.readFile(path.join(project, '.echo-studio', 'modules.lock.json'), 'utf8'))
      const moduleWorkspace = JSON.parse(await fs.readFile(path.join(project, '.echo-studio', 'module-workspace.json'), 'utf8'))
      const runtimeModuleLock = JSON.parse(await fs.readFile(path.join(project, 'src', 'generated', 'resources', 'META-INF', 'echo.modules.lock.json'), 'utf8'))
      const neoforgeToml = await fs.readFile(path.join(project, 'src', 'generated', 'resources', 'META-INF', 'neoforge.mods.toml'), 'utf8')
      expect(result.state.files.find((file) => file.path === 'src/generated/resources/META-INF/echo.modules.lock.json')?.expected).toBe(true)
      expect(result.state.files.find((file) => file.path === 'src/generated/resources/META-INF/neoforge.mods.toml')?.expected).toBe(true)
      expect(moduleLock.schemaVersion).toBe('echo.studio.modules.lock.v1')
      expect(moduleWorkspace.schemaVersion).toBe('echo.studio.modules.workspace.v1')
      expect(moduleLock.project).toEqual({ id: 'teamnova:weather_pack', version: '1.0.0' })
      expect(moduleWorkspace.project).toEqual({ id: 'teamnova:weather_pack', version: '1.0.0' })
      expect(moduleLock.declared).toContain('echo:core')
      expect(moduleLock.modules.some((mod: { id: string }) => mod.id === 'echocore')).toBe(true)
      expect(moduleWorkspace.modules.some((mod: { id: string }) => mod.id === 'echocore')).toBe(true)
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
      expect(result.state.moduleWorkspace).toMatchObject({
        schemaVersion: 'echo.studio.modules.workspace.status.v1',
        exists: true,
        upToDate: true,
        expectedModuleIds: expect.arrayContaining(['echocore']),
        mappedModuleIds: expect.arrayContaining(['echocore'])
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
      const buildGradle = await fs.readFile(path.join(project, 'build.gradle'), 'utf8')
      expect(buildGradle).toContain('tasks.register("echoModuleWorkspace")')
      expect(buildGradle).toContain('.echo-studio/module-workspace.json')
    })
  })

  it('reports missing runtime preview launcher paths from generated Gradle properties', async () => {
    await withProject(async (project) => {
      const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
      const result = await setupDevWorkspace(project, {
        mode: 'gradle',
        runtimes: ['echo_native', 'standalone'],
        force: false
      })

      expect(result.state.ready).toBe(true)
      expect(result.state.runtimeLaunchers).toMatchObject({
        schemaVersion: 'echo.studio.runtime.launchers.status.v1',
        gradlePropertiesPath: 'gradle.properties',
        gradlePropertiesExists: true,
        nativeExpected: true,
        nativeConfigured: false,
        nativeExecutable: '',
        standaloneExpected: true,
        standaloneConfigured: false,
        standaloneExecutable: '',
        ready: false
      })
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
      expect(state.moduleWorkspace.upToDate).toBe(false)
      expect(state.moduleWorkspace.missingFromMap).toEqual(expect.arrayContaining(['echomissioncore']))
      expect(state.moduleLock.runtimeUpToDate).toBe(false)
      expect(state.modulePlan.closure.map((mod) => mod.id)).toEqual(expect.arrayContaining(['echomissioncore']))
    })
  })

  it('blocks package tasks when generated module locks are stale', async () => {
    await withProject(async (project) => {
      const { runDevTask, setupDevWorkspace } = await import('../../main/devWorkspaceService')
      await setupDevWorkspace(project, {
        mode: 'gradle',
        runtimes: ['neoforge'],
        force: false
      })

      const next = manifest()
      next.target.modules = ['echo:mission_core']
      next.dependencies.required = ['echo:core', 'echo:mission_core']
      await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(next, null, 2), 'utf8')

      await expect(runDevTask(project, 'package:local')).rejects.toThrow('Refresh Dev Workspace so generated module locks match the current manifest.')
    })
  })

  it('writes local ECHO module source links into the dev-only workspace map', async () => {
    const previous = process.env.ECHO_MODULES_DIR
    await withProject(async (project) => {
      const modulesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-modules-root-'))
      try {
        process.env.ECHO_MODULES_DIR = modulesRoot
        const descriptorPath = path.join(modulesRoot, 'addons', 'echocore', 'src', 'main', 'resources', 'META-INF', 'echo.mod.json')
        await fs.mkdir(path.dirname(descriptorPath), { recursive: true })
        await fs.writeFile(path.join(modulesRoot, 'addons', 'echocore', 'build.gradle'), 'plugins { id "java-library" }\n', 'utf8')
        await fs.mkdir(path.join(modulesRoot, 'metadata', 'modules'), { recursive: true })
        await fs.writeFile(descriptorPath, JSON.stringify({ id: 'echocore', version: '1.0.0' }, null, 2), 'utf8')
        await fs.writeFile(path.join(modulesRoot, 'metadata', 'modules', 'index.json'), JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-06-09T00:00:00.000Z',
          modules: [
            {
              id: 'echocore',
              name: 'ECHO: Core',
              version: '1.0.0',
              kind: 'library',
              role: 'foundation',
              channel: 'stable',
              standalone: true,
              descriptorPath: 'addons/echocore/src/main/resources/META-INF/echo.mod.json',
              moduleDir: 'addons/echocore',
              requires: [],
              optional: [],
              provides: ['core.services'],
              apiStability: 'stable'
            }
          ]
        }, null, 2), 'utf8')

        const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
        const result = await setupDevWorkspace(project, {
          mode: 'gradle',
          runtimes: ['neoforge'],
          force: false
        })
        const moduleWorkspace = JSON.parse(await fs.readFile(path.join(project, '.echo-studio', 'module-workspace.json'), 'utf8'))
        const settingsGradle = await fs.readFile(path.join(project, 'settings.gradle'), 'utf8')
        const buildGradle = await fs.readFile(path.join(project, 'build.gradle'), 'utf8')

        expect(result.state.moduleCatalog.localAvailable).toBe(true)
        expect(result.state.moduleWorkspace).toMatchObject({
          exists: true,
          upToDate: true,
          moduleCount: 1,
          localModuleCount: 1,
          gradleBuildCount: 1,
          gradleDependencyReadyCount: 1,
          gradleDependencyIssues: []
        })
        expect(moduleWorkspace.localModuleCount).toBe(1)
        expect(moduleWorkspace.gradleBuildCount).toBe(1)
        expect(moduleWorkspace.gradleDependencyReadyCount).toBe(1)
        expect(moduleWorkspace.modules[0]).toMatchObject({
          id: 'echocore',
          localSource: true,
          gradleBuild: true,
          gradleBuildPath: path.join(modulesRoot, 'addons', 'echocore', 'build.gradle'),
          gradleProjectPath: ':echocore',
          gradleProjectDependencies: [],
          missingGradleProjectDependencies: [],
          gradleDependencyReady: true,
          dependencyNotation: 'project(":echocore")',
          moduleDir: path.join(modulesRoot, 'addons', 'echocore'),
          descriptorPath
        })
        expect(settingsGradle).toContain('include(projectPath)')
        expect(settingsGradle).toContain('project(projectPath).projectDir = moduleRoot')
        expect(settingsGradle).toContain('.echo-studio/module-workspace.json')
        expect(settingsGradle).toContain('module.gradleDependencyReady')
        expect(buildGradle).toContain('implementation project(String.valueOf(module.gradleProjectPath))')
        expect(buildGradle).toContain('gradle.beforeProject')
        expect(buildGradle).toContain('dependencyNotation')
      } finally {
        if (previous === undefined) delete process.env.ECHO_MODULES_DIR
        else process.env.ECHO_MODULES_DIR = previous
        await fs.rm(modulesRoot, { recursive: true, force: true })
      }
    })
  })

  it('records unresolved local module Gradle project dependencies without wiring them', async () => {
    const previous = process.env.ECHO_MODULES_DIR
    await withProject(async (project) => {
      const modulesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-modules-root-'))
      try {
        process.env.ECHO_MODULES_DIR = modulesRoot
        const descriptorPath = path.join(modulesRoot, 'addons', 'echocore', 'src', 'main', 'resources', 'META-INF', 'echo.mod.json')
        await fs.mkdir(path.dirname(descriptorPath), { recursive: true })
        await fs.writeFile(
          path.join(modulesRoot, 'addons', 'echocore', 'build.gradle'),
          "plugins { id 'java-library' }\ndependencies { implementation project(':echo-native-contracts') }\n",
          'utf8'
        )
        await fs.mkdir(path.join(modulesRoot, 'metadata', 'modules'), { recursive: true })
        await fs.writeFile(descriptorPath, JSON.stringify({ id: 'echocore', version: '1.0.0' }, null, 2), 'utf8')
        await fs.writeFile(path.join(modulesRoot, 'metadata', 'modules', 'index.json'), JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-06-09T00:00:00.000Z',
          modules: [
            {
              id: 'echocore',
              name: 'ECHO: Core',
              version: '1.0.0',
              kind: 'library',
              role: 'foundation',
              channel: 'stable',
              standalone: true,
              descriptorPath: 'addons/echocore/src/main/resources/META-INF/echo.mod.json',
              moduleDir: 'addons/echocore',
              requires: [],
              optional: [],
              provides: ['core.services'],
              apiStability: 'stable'
            }
          ]
        }, null, 2), 'utf8')

        const { setupDevWorkspace } = await import('../../main/devWorkspaceService')
        const result = await setupDevWorkspace(project, {
          mode: 'gradle',
          runtimes: ['neoforge'],
          force: false
        })
        const moduleWorkspace = JSON.parse(await fs.readFile(path.join(project, '.echo-studio', 'module-workspace.json'), 'utf8'))

        expect(result.state.moduleWorkspace).toMatchObject({
          gradleBuildCount: 1,
          gradleDependencyReadyCount: 0,
          gradleDependencyIssues: [{
            moduleId: 'echocore',
            moduleName: 'Core',
            projectPath: ':echocore',
            missingProjectDependencies: [':echo-native-contracts']
          }]
        })
        expect(moduleWorkspace.modules[0]).toMatchObject({
          id: 'echocore',
          gradleBuild: true,
          gradleProjectPath: ':echocore',
          gradleProjectDependencies: [':echo-native-contracts'],
          missingGradleProjectDependencies: [':echo-native-contracts'],
          gradleDependencyReady: false
        })
        expect(moduleWorkspace.modules[0].dependencyNotation).toBeUndefined()
      } finally {
        if (previous === undefined) delete process.env.ECHO_MODULES_DIR
        else process.env.ECHO_MODULES_DIR = previous
        await fs.rm(modulesRoot, { recursive: true, force: true })
      }
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
      expect(result.state.runtimeLaunchers).toMatchObject({
        nativeExpected: true,
        nativeConfigured: true,
        nativeExecutable: 'C:/ECHO Runtime/echo-native.exe',
        standaloneExpected: true,
        standaloneConfigured: true,
        standaloneExecutable: 'C:/ECHO Runtime/echo-standalone.exe',
        ready: true
      })
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

  it('runs the local ECHO-Modules graph validator as a dev task', async () => {
    const previous = process.env.ECHO_MODULES_DIR
    await withProject(async (project) => {
      const modulesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-modules-root-'))
      try {
        process.env.ECHO_MODULES_DIR = modulesRoot
        await fs.mkdir(path.join(modulesRoot, 'metadata', 'modules'), { recursive: true })
        await fs.mkdir(path.join(modulesRoot, 'scripts'), { recursive: true })
        await fs.writeFile(path.join(modulesRoot, 'metadata', 'modules', 'index.json'), JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-06-09T00:00:00.000Z',
          modules: []
        }, null, 2), 'utf8')
        await fs.writeFile(
          path.join(modulesRoot, 'scripts', 'validate-module-graph.mjs'),
          'console.log("module graph ok")\n',
          'utf8'
        )

        const { runDevTask } = await import('../../main/devWorkspaceService')
        const result = await runDevTask(project, 'modules:validate')

        expect(result.status).toBe('completed')
        expect(result.command).toBe('node scripts/validate-module-graph.mjs')
        expect(result.cwd).toBe(modulesRoot)
        expect(result.stdout).toContain('module graph ok')
      } finally {
        if (previous === undefined) delete process.env.ECHO_MODULES_DIR
        else process.env.ECHO_MODULES_DIR = previous
        await fs.rm(modulesRoot, { recursive: true, force: true })
      }
    })
  })

  it('generates release artifacts for selected local ECHO modules as a dev task', async () => {
    const previous = process.env.ECHO_MODULES_DIR
    await withProject(async (project) => {
      const modulesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-modules-root-'))
      try {
        process.env.ECHO_MODULES_DIR = modulesRoot
        const descriptorPath = path.join(modulesRoot, 'addons', 'echocore', 'src', 'main', 'resources', 'META-INF', 'echo.mod.json')
        await fs.mkdir(path.dirname(descriptorPath), { recursive: true })
        await fs.mkdir(path.join(modulesRoot, 'metadata', 'modules'), { recursive: true })
        await fs.mkdir(path.join(modulesRoot, 'scripts'), { recursive: true })
        await fs.writeFile(descriptorPath, JSON.stringify({ id: 'echocore', version: '1.0.0' }, null, 2), 'utf8')
        await fs.writeFile(path.join(modulesRoot, 'metadata', 'modules', 'index.json'), JSON.stringify({
          schemaVersion: 1,
          generatedAt: '2026-06-09T00:00:00.000Z',
          modules: [
            {
              id: 'echocore',
              name: 'ECHO: Core',
              version: '1.0.0',
              kind: 'library',
              role: 'foundation',
              channel: 'stable',
              standalone: true,
              descriptorPath: 'addons/echocore/src/main/resources/META-INF/echo.mod.json',
              moduleDir: 'addons/echocore',
              requires: [],
              optional: [],
              provides: ['core.services'],
              apiStability: 'stable'
            }
          ]
        }, null, 2), 'utf8')
        await fs.writeFile(
          path.join(modulesRoot, 'scripts', 'generate-module-release.mjs'),
          [
            'import { mkdirSync, writeFileSync } from "node:fs"',
            'mkdirSync("dist/echo-module-release/echocore", { recursive: true })',
            'writeFileSync("dist/echo-module-release/echo-release.json", "{}")',
            'writeFileSync("dist/echo-module-release/checksums.sha256", "hash  echocore/echocore-1.0.0.echo-addon\\n")',
            'writeFileSync("dist/echo-module-release/echocore/echocore-1.0.0.echo-addon", "addon")',
            'writeFileSync("dist/echo-module-release/echocore/echocore-1.0.0-neoforge.jar", "jar")',
            'console.log(process.argv.slice(2).join(" "))'
          ].join('\n'),
          'utf8'
        )

        const { runDevTask, setupDevWorkspace } = await import('../../main/devWorkspaceService')
        await setupDevWorkspace(project, {
          mode: 'gradle',
          runtimes: ['neoforge'],
          force: false
        })
        const result = await runDevTask(project, 'modules:releaseSelected')

        expect(result.status).toBe('completed')
        expect(result.cwd).toBe(modulesRoot)
        expect(result.command).toContain('scripts/generate-module-release.mjs')
        expect(result.command).toContain('--package-from-source')
        expect(result.command).toContain('--module echocore')
        expect(result.stdout).toContain('--module echocore')
        expect(result.artifacts.map((artifact) => artifact.name)).toEqual(expect.arrayContaining([
          'echo-release.json',
          'checksums.sha256',
          'echocore-1.0.0.echo-addon',
          'echocore-1.0.0-neoforge.jar'
        ]))
        expect(result.artifacts.find((artifact) => artifact.name === 'echocore-1.0.0.echo-addon')?.path)
          .toContain(path.join('dist', 'echo-module-release', 'echocore', 'echocore-1.0.0.echo-addon'))
      } finally {
        if (previous === undefined) delete process.env.ECHO_MODULES_DIR
        else process.env.ECHO_MODULES_DIR = previous
        await fs.rm(modulesRoot, { recursive: true, force: true })
      }
    })
  })

  it('stops a running detached dev task and records it in the task log', async () => {
    await withProject(async (project) => {
      await fs.writeFile(
        path.join(project, 'gradlew.bat'),
        [
          '@echo off',
          'echo fake client started',
          'ping 127.0.0.1 -n 30 > nul'
        ].join('\r\n'),
        'utf8'
      )
      const shLauncher = path.join(project, 'gradlew')
      await fs.writeFile(
        shLauncher,
        [
          '#!/usr/bin/env sh',
          'echo fake client started',
          'sleep 30'
        ].join('\n'),
        'utf8'
      )
      if (process.platform !== 'win32') await fs.chmod(shLauncher, 0o755)

      const { listRunningDevTasks, readDevTaskLog, runDevTask, setupDevWorkspace, stopDevTask } = await import('../../main/devWorkspaceService')
      await setupDevWorkspace(project, {
        mode: 'gradle',
        runtimes: ['neoforge'],
        force: false
      })
      const started = await runDevTask(project, 'gradle:runClient')

      expect(started.status).toBe('started')
      expect(started.logPath).toBeDefined()

      const running = await listRunningDevTasks(project)
      const stopped = await stopDevTask(project, started.logPath!)
      const stoppedAgain = await stopDevTask(project, started.logPath!)
      const runningAfterStop = await listRunningDevTasks(project)
      const log = await readDevTaskLog(project, started.logPath!)

      expect(running).toHaveLength(1)
      expect(running[0]).toMatchObject({
        taskId: 'gradle:runClient',
        status: 'started',
        command: started.command,
        cwd: started.cwd,
        logPath: started.logPath
      })
      expect(stopped.status).toBe('stopped')
      expect(stopped.taskId).toBe('gradle:runClient')
      expect(stoppedAgain.status).toBe('not_running')
      expect(runningAfterStop).toHaveLength(0)
      expect(log).toContain('Stop requested from ECHO Studio.')
      expect(log).toContain('[status] stopped')
    })
  })
})
