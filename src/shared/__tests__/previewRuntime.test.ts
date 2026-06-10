import { describe, expect, it } from 'vitest'
import type { DevWorkspaceState } from '../devWorkspace'
import { MODULE_READY_TASKS, PREVIEW_RUNTIME_TASKS, moduleReadinessDisabledReason, previewRuntimeDisabledReason } from '../previewRuntime'

function workspace(overrides?: Partial<DevWorkspaceState>): DevWorkspaceState {
  return {
    ready: true,
    mode: 'gradle',
    projectPath: 'C:\\project',
    gradleReady: true,
    hasGradleWrapper: true,
    sourceReady: true,
    runtimeTargets: ['neoforge', 'echo_native', 'standalone'],
    files: [],
    toolchain: {
      schemaVersion: 'echo.studio.toolchain.status.v1',
      requiredJavaVersion: 25,
      javaAvailable: true,
      javaVersion: '25.0.1',
      javaMajorVersion: 25,
      javaMeetsRequirement: true,
      gradleWrapper: true,
      gradleAvailable: true,
      gradleCommand: '.\\gradlew.bat',
      issues: []
    },
    modulePlan: {
      declared: ['echo:core'],
      normalizedDeclared: ['echocore'],
      targetModules: [],
      requiredModules: [],
      optionalModules: [],
      enabled: [],
      unknown: [],
      missingRequired: [],
      optionalAvailable: [],
      closure: []
    },
    moduleCatalog: {
      schemaVersion: 'echo.studio.modules.catalog.status.v1',
      source: 'builtin',
      localAvailable: false,
      warnings: []
    },
    moduleWorkspace: {
      schemaVersion: 'echo.studio.modules.workspace.status.v1',
      path: '.echo-studio/module-workspace.json',
      exists: true,
      upToDate: true,
      projectMatches: true,
      moduleCount: 1,
      localModuleCount: 0,
      expectedModuleIds: ['echocore'],
      mappedModuleIds: ['echocore'],
      missingFromMap: [],
      extraInMap: []
    },
    moduleLock: {
      schemaVersion: 'echo.studio.modules.lock.status.v1',
      studioLockPath: '.echo-studio/modules.lock.json',
      runtimeLockPath: 'src/generated/resources/META-INF/echo.modules.lock.json',
      studioExists: true,
      runtimeExists: true,
      runtimeExpected: true,
      upToDate: true,
      runtimeUpToDate: true,
      projectMatches: true,
      expectedModuleIds: ['echocore'],
      lockedModuleIds: ['echocore'],
      runtimeModuleIds: ['echocore'],
      missingFromLock: [],
      extraInLock: [],
      missingFromRuntimeLock: [],
      extraInRuntimeLock: []
    },
    runtimeLaunchers: {
      schemaVersion: 'echo.studio.runtime.launchers.status.v1',
      gradlePropertiesPath: 'gradle.properties',
      gradlePropertiesExists: true,
      nativeExpected: true,
      nativeConfigured: true,
      nativeExecutable: 'C:/ECHO/echo-native.exe',
      standaloneExpected: true,
      standaloneConfigured: true,
      standaloneExecutable: 'C:/ECHO/echo-standalone.exe',
      ready: true
    },
    artifacts: [],
    lastSetupAt: '2026-06-10T00:00:00.000Z',
    ...overrides
  }
}

describe('previewRuntimeDisabledReason', () => {
  it('defines the shared runtime task set for Preview and Dev Workspace', () => {
    expect(PREVIEW_RUNTIME_TASKS).toEqual([
      'gradle:runClient',
      'gradle:runServer',
      'preview:native',
      'preview:standalone'
    ])
  })

  it('defines project tasks that require current module locks and closure', () => {
    expect(MODULE_READY_TASKS).toEqual([
      'gradle:build',
      'gradle:test',
      'gradle:runData',
      'modules:releaseSelected',
      'studio:releaseGate',
      'package:local'
    ])
  })

  it('allows runtime launch when workspace, module locks, source map, and launchers are current', () => {
    expect(previewRuntimeDisabledReason('gradle:runClient', workspace())).toBeNull()
    expect(previewRuntimeDisabledReason('preview:native', workspace())).toBeNull()
  })

  it('blocks preview launch when generated module locks are stale', () => {
    const state = workspace({
      moduleLock: {
        ...workspace().moduleLock,
        upToDate: false,
        missingFromLock: ['echomissioncore']
      }
    })

    expect(previewRuntimeDisabledReason('gradle:runClient', state)).toBe('Refresh Dev Workspace so generated module locks match the current manifest.')
  })

  it('blocks preview launch when the local module source map is stale', () => {
    const state = workspace({
      moduleWorkspace: {
        ...workspace().moduleWorkspace,
        upToDate: false,
        missingFromMap: ['echomissioncore']
      }
    })

    expect(previewRuntimeDisabledReason('preview:standalone', state)).toBe('Refresh Dev Workspace so local module source map matches the current manifest.')
  })

  it('blocks runtime launch when resolved modules are blocked', () => {
    const state = workspace({
      modulePlan: {
        ...workspace().modulePlan,
        closure: [
          {
            id: 'echounsafe',
            aliases: ['echo:unsafe'],
            name: 'Unsafe',
            role: 'test',
            kind: 'library',
            status: 'experimental',
            channel: 'alpha',
            standaloneReady: false,
            launcherVisible: false,
            ashfallRequired: false,
            publicApi: 'experimental',
            trustLevel: 'blocked',
            blocked: true,
            blockReason: 'Security review failed.',
            requires: [],
            optional: [],
            provides: [],
            runtimes: ['neoforge'],
            creatorUse: 'Blocked test module.'
          }
        ]
      }
    })

    expect(previewRuntimeDisabledReason('gradle:runClient', state)).toBe('Remove blocked ECHO modules before launching previews: Unsafe.')
  })

  it('explains missing and unknown module readiness blockers for other local tasks', () => {
    expect(moduleReadinessDisabledReason(workspace({
      modulePlan: {
        ...workspace().modulePlan,
        missingRequired: [
          {
            id: 'echomissioncore',
            aliases: ['echo:mission_core'],
            name: 'MissionCore',
            role: 'missions',
            kind: 'library',
            status: 'stable',
            channel: 'stable',
            standaloneReady: true,
            launcherVisible: true,
            ashfallRequired: false,
            publicApi: 'stable',
            requires: [],
            optional: [],
            provides: [],
            runtimes: ['neoforge'],
            creatorUse: 'Mission APIs.'
          }
        ]
      }
    }), 'running Package Local Release')).toBe('Add required ECHO module closure before running Package Local Release: MissionCore.')

    expect(moduleReadinessDisabledReason(workspace({
      modulePlan: {
        ...workspace().modulePlan,
        unknown: ['echo:made_up']
      }
    }), 'running Build All Targets')).toBe('Resolve unknown ECHO module dependencies before running Build All Targets: echo:made_up.')
  })

  it('blocks local tasks when linked ECHO module Gradle dependencies are unresolved', () => {
    const state = workspace({
      moduleWorkspace: {
        ...workspace().moduleWorkspace,
        gradleDependencyIssues: [
          {
            moduleId: 'echocore',
            moduleName: 'Core',
            projectPath: ':echocore',
            missingProjectDependencies: [':echo-native-contracts']
          }
        ]
      }
    })

    expect(moduleReadinessDisabledReason(state, 'running Build All Targets')).toBe(
      'Resolve local ECHO module Gradle dependency gaps before running Build All Targets: Core missing :echo-native-contracts.'
    )
    expect(previewRuntimeDisabledReason('gradle:runClient', state)).toBe(
      'Resolve local ECHO module Gradle dependency gaps before launching previews: Core missing :echo-native-contracts.'
    )
  })
})
