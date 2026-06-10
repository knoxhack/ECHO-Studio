import type { DevTaskId, DevWorkspaceState } from './devWorkspace'

export const PREVIEW_RUNTIME_TASKS: DevTaskId[] = [
  'gradle:runClient',
  'gradle:runServer',
  'preview:native',
  'preview:standalone'
]

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
  if (taskId === 'gradle:runClient' && !devWorkspace.runtimeTargets.includes('neoforge')) return 'Enable NeoForge and run setup.'
  if (taskId === 'gradle:runServer' && !devWorkspace.runtimeTargets.includes('neoforge')) return 'Enable NeoForge and run setup.'
  if (taskId === 'preview:native' && !devWorkspace.runtimeTargets.includes('echo_native')) return 'Enable ECHO Native and run setup.'
  if (taskId === 'preview:standalone' && !devWorkspace.runtimeTargets.includes('standalone')) return 'Enable Standalone Runtime and run setup.'
  if (taskId === 'preview:native' && !devWorkspace.runtimeLaunchers.nativeConfigured) return 'Set ECHO Native executable in Settings and run setup.'
  if (taskId === 'preview:standalone' && !devWorkspace.runtimeLaunchers.standaloneConfigured) return 'Set Standalone executable in Settings and run setup.'
  return null
}
