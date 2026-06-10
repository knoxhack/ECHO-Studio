import type { DevTaskId, DevWorkspaceState } from './devWorkspace'
import type { EchoModuleRecord } from './moduleCatalog'

export const PREVIEW_RUNTIME_TASKS: DevTaskId[] = [
  'gradle:runClient',
  'gradle:runServer',
  'preview:native',
  'preview:standalone'
]

export const MODULE_READY_TASKS: DevTaskId[] = [
  'gradle:build',
  'gradle:test',
  'gradle:runData',
  'modules:releaseSelected',
  'studio:releaseGate',
  'package:local'
]

function moduleNames(modules: EchoModuleRecord[]): string {
  return modules.map((mod) => mod.name).join(', ')
}

export function moduleReadinessDisabledReason(
  devWorkspace: DevWorkspaceState,
  actionPhrase = 'running local tasks'
): string | null {
  const blockedModules = devWorkspace.modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
  if (blockedModules.length > 0) {
    return `Remove blocked ECHO modules before ${actionPhrase}: ${moduleNames(blockedModules)}.`
  }
  if (devWorkspace.modulePlan.missingRequired.length > 0) {
    return `Add required ECHO module closure before ${actionPhrase}: ${moduleNames(devWorkspace.modulePlan.missingRequired)}.`
  }
  if (devWorkspace.modulePlan.unknown.length > 0) {
    return `Resolve unknown ECHO module dependencies before ${actionPhrase}: ${devWorkspace.modulePlan.unknown.join(', ')}.`
  }
  const gradleDependencyIssues = devWorkspace.moduleWorkspace.gradleDependencyIssues ?? []
  if (gradleDependencyIssues.length > 0) {
    const details = gradleDependencyIssues
      .map((issue) => `${issue.moduleName} missing ${issue.missingProjectDependencies.join(', ')}`)
      .join('; ')
    return `Resolve local ECHO module Gradle dependency gaps before ${actionPhrase}: ${details}.`
  }
  return null
}

export function previewRuntimeDisabledReason(
  taskId: DevTaskId,
  devWorkspace: DevWorkspaceState | null | undefined,
  hasActiveProject = true
): string | null {
  if (!hasActiveProject) return 'Select a project first.'
  if (!devWorkspace) return 'Inspecting workspace.'
  if (!devWorkspace.gradleReady) return 'Set up a Gradle workspace first.'
  if (!devWorkspace.toolchain.javaAvailable) return `Install Java ${devWorkspace.toolchain.requiredJavaVersion} or add it to PATH.`
  if (!devWorkspace.toolchain.javaMeetsRequirement) return `Use Java ${devWorkspace.toolchain.requiredJavaVersion} for this generated workspace.`
  if (!devWorkspace.toolchain.gradleAvailable) return 'Run Dev Workspace setup to generate the pinned Gradle launcher or install Gradle.'
  if (!devWorkspace.moduleLock.upToDate) return 'Refresh Dev Workspace so generated module locks match the current manifest.'
  if (!devWorkspace.moduleWorkspace.upToDate) return 'Refresh Dev Workspace so local module source map matches the current manifest.'
  const moduleReason = moduleReadinessDisabledReason(devWorkspace, 'launching previews')
  if (moduleReason) return moduleReason
  if (taskId === 'gradle:runClient' && !devWorkspace.runtimeTargets.includes('neoforge')) return 'Enable NeoForge and run setup.'
  if (taskId === 'gradle:runServer' && !devWorkspace.runtimeTargets.includes('neoforge')) return 'Enable NeoForge and run setup.'
  if (taskId === 'preview:native' && !devWorkspace.runtimeTargets.includes('echo_native')) return 'Enable ECHO Native and run setup.'
  if (taskId === 'preview:standalone' && !devWorkspace.runtimeTargets.includes('standalone')) return 'Enable Standalone Runtime and run setup.'
  if (taskId === 'preview:native' && !devWorkspace.runtimeLaunchers.nativeConfigured) return 'Set ECHO Native executable in Settings and run setup.'
  if (taskId === 'preview:standalone' && !devWorkspace.runtimeLaunchers.standaloneConfigured) return 'Set Standalone executable in Settings and run setup.'
  return null
}
