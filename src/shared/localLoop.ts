import type { DevWorkspaceState } from './devWorkspace'
import type { ValidationReport } from './types'

export type LocalLoopStepId = 'modules' | 'workspace' | 'preview' | 'validation' | 'release'
export type LocalLoopStepState = 'ready' | 'setup' | 'attention'

export interface LocalLoopStepStatus {
  id: LocalLoopStepId
  label: string
  state: LocalLoopStepState
  detail: string
  route: string
  actionLabel: string
}

export interface LocalLoopStatus {
  steps: LocalLoopStepStatus[]
  nextStep?: LocalLoopStepStatus
}

export interface LocalLoopStatusInput {
  hasProject: boolean
  validationReport?: ValidationReport | null
  devWorkspace?: DevWorkspaceState | null
  releaseGateReady?: boolean
  releaseAssetsReady?: boolean
}

function noProjectStep(id: LocalLoopStepId, label: string): LocalLoopStepStatus {
  return {
    id,
    label,
    state: 'setup',
    detail: 'Create or select a project to start this part of the local loop.',
    route: '/create',
    actionLabel: 'Create Project'
  }
}

function hasReadyReleaseArtifacts(devWorkspace: DevWorkspaceState | null | undefined): boolean {
  const artifacts = devWorkspace?.artifacts ?? []
  return Boolean(
    artifacts.some((artifact) => artifact.name.endsWith('.echo-addon')) &&
    artifacts.some((artifact) => artifact.name === 'echo-release.json') &&
    artifacts.some((artifact) => artifact.name === 'checksums.sha256')
  )
}

function moduleDetail(devWorkspace: DevWorkspaceState): string {
  const blockedModules = devWorkspace.modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
  const parts = [
    !devWorkspace.moduleLock.upToDate ? 'Module lock is stale.' : '',
    !devWorkspace.moduleWorkspace.upToDate ? 'Module workspace map is stale.' : '',
    devWorkspace.modulePlan.missingRequired.length ? `Missing required: ${devWorkspace.modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.` : '',
    devWorkspace.modulePlan.unknown.length ? `Unknown: ${devWorkspace.modulePlan.unknown.join(', ')}.` : '',
    blockedModules.length ? `Blocked: ${blockedModules.map((mod) => mod.name).join(', ')}.` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : `${devWorkspace.modulePlan.closure.length} module(s) resolved and current.`
}

function buildModuleStep(input: LocalLoopStatusInput): LocalLoopStepStatus {
  if (!input.hasProject) return noProjectStep('modules', 'Modules')
  if (!input.devWorkspace) {
    return {
      id: 'modules',
      label: 'Modules',
      state: 'setup',
      detail: 'Choose ECHO Modules and set up the workspace to generate a current module lock.',
      route: '/modules',
      actionLabel: 'Choose Modules'
    }
  }
  const blockedModules = input.devWorkspace.modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
  const ready = input.devWorkspace.moduleLock.upToDate &&
    input.devWorkspace.moduleWorkspace.upToDate &&
    input.devWorkspace.modulePlan.missingRequired.length === 0 &&
    input.devWorkspace.modulePlan.unknown.length === 0 &&
    blockedModules.length === 0
  return {
    id: 'modules',
    label: 'Modules',
    state: ready ? 'ready' : 'attention',
    detail: moduleDetail(input.devWorkspace),
    route: '/modules',
    actionLabel: ready ? 'Review Modules' : 'Fix Modules'
  }
}

function buildWorkspaceStep(input: LocalLoopStatusInput): LocalLoopStepStatus {
  if (!input.hasProject) return noProjectStep('workspace', 'Workspace')
  const devWorkspace = input.devWorkspace
  if (!devWorkspace?.lastSetupAt) {
    return {
      id: 'workspace',
      label: 'Workspace',
      state: 'setup',
      detail: 'Generate the local Gradle workspace, module lock, source map, and launcher files.',
      route: '/dev-workspace',
      actionLabel: 'Set Up Workspace'
    }
  }
  const ready = devWorkspace.mode === 'visual' || (devWorkspace.gradleReady && devWorkspace.hasGradleWrapper)
  return {
    id: 'workspace',
    label: 'Workspace',
    state: ready ? 'ready' : 'attention',
    detail: ready
      ? devWorkspace.mode === 'visual'
        ? 'Visual workspace is selected; code generation is optional.'
        : 'Pinned Gradle launcher and generated project files are available.'
      : 'Workspace files exist, but Gradle setup or the pinned launcher needs attention.',
    route: '/dev-workspace',
    actionLabel: ready ? 'Open Workspace' : 'Repair Workspace'
  }
}

function buildPreviewStep(input: LocalLoopStatusInput): LocalLoopStepStatus {
  if (!input.hasProject) return noProjectStep('preview', 'Preview')
  const devWorkspace = input.devWorkspace
  if (!devWorkspace?.lastSetupAt) {
    return {
      id: 'preview',
      label: 'Preview',
      state: 'setup',
      detail: 'Set up the workspace before launching local preview clients or runtimes.',
      route: '/dev-workspace',
      actionLabel: 'Set Up Workspace'
    }
  }
  const ready = devWorkspace.runtimeLaunchers.ready
  return {
    id: 'preview',
    label: 'Preview',
    state: ready ? 'ready' : 'attention',
    detail: ready
      ? 'Selected runtime preview launchers are configured.'
      : 'Configure missing ECHO Native or Standalone executable paths, then run setup again.',
    route: ready ? '/preview' : '/settings',
    actionLabel: ready ? 'Run Preview' : 'Configure Preview'
  }
}

function buildValidationStep(input: LocalLoopStatusInput): LocalLoopStepStatus {
  if (!input.hasProject) return noProjectStep('validation', 'Validation')
  if (!input.validationReport) {
    return {
      id: 'validation',
      label: 'Validation',
      state: 'setup',
      detail: 'Run validation to check contracts, modules, content, assets, and release readiness.',
      route: '/validation',
      actionLabel: 'Run Validation'
    }
  }
  return {
    id: 'validation',
    label: 'Validation',
    state: input.validationReport.publishingReady ? 'ready' : 'attention',
    detail: input.validationReport.publishingReady
      ? `Validation passes at ${input.validationReport.compatibilityScore}%.`
      : `Blockers ${input.validationReport.counts.BLOCKER}, errors ${input.validationReport.counts.ERROR}.`,
    route: '/validation',
    actionLabel: input.validationReport.publishingReady ? 'Review Validation' : 'Fix Validation'
  }
}

function buildReleaseStep(input: LocalLoopStatusInput): LocalLoopStepStatus {
  if (!input.hasProject) return noProjectStep('release', 'Release')
  const releaseAssetsReady = input.releaseAssetsReady ?? hasReadyReleaseArtifacts(input.devWorkspace)
  if (releaseAssetsReady) {
    return {
      id: 'release',
      label: 'Release',
      state: 'ready',
      detail: 'Release artifacts, echo-release.json, and checksums.sha256 are ready.',
      route: '/release',
      actionLabel: 'Review Release'
    }
  }
  if (input.validationReport && !input.validationReport.publishingReady) {
    return {
      id: 'release',
      label: 'Release',
      state: 'attention',
      detail: 'Fix validation blockers and errors before preparing public release assets.',
      route: '/validation',
      actionLabel: 'Fix Validation'
    }
  }
  return {
    id: 'release',
    label: 'Release',
    state: 'setup',
    detail: input.releaseGateReady
      ? 'Local release gate passed. Prepare release assets next.'
      : 'Run the local release gate, then prepare release assets and Release Index sidecars.',
    route: '/release',
    actionLabel: 'Gate + Prepare Assets'
  }
}

export function buildLocalLoopStatus(input: LocalLoopStatusInput): LocalLoopStatus {
  const steps = [
    buildModuleStep(input),
    buildWorkspaceStep(input),
    buildPreviewStep(input),
    buildValidationStep(input),
    buildReleaseStep(input)
  ]
  return {
    steps,
    nextStep: steps.find((step) => step.state !== 'ready')
  }
}
