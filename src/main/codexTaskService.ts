import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { autoFixManifest } from '../shared/validation'
import {
  buildUnifiedTextDiff,
  jsonDocument,
  validationSnapshot,
  type CodexTask,
  type CodexTaskActionResult,
  type CodexTaskLane
} from '../shared/codexTasks'
import { preferredModuleAlias, resolveProjectModulePlan, type EchoModuleRecord } from '../shared/moduleCatalog'
import type { AddonManifest, PackOSReport, Runtime } from '../shared/types'
import type { DevWorkspaceState } from '../shared/devWorkspace'
import { runProjectCheck } from '../shared/projectValidation'
import type { ContentRecord, ContentType, Mission } from '../shared/content/schemas'
import { listAssetFiles, readManifest, writeManifest } from './fsService'
import { readAllContent, readLangKeys } from './contentService'
import { inspectDevWorkspace, setupDevWorkspace } from './devWorkspaceService'
import { packageAddon } from './packageService'
import { listEchoModules } from './moduleCatalogService'

interface CodexTaskStore {
  rejected: Record<string, string>
  applied: Record<string, string>
}

interface ProjectContext {
  manifest: AddonManifest
  moduleCatalog: EchoModuleRecord[]
  report: PackOSReport
  content: Record<ContentType, ContentRecord[]>
  langKeys: string[]
  assetFiles: string[]
  devWorkspace?: DevWorkspaceState
  workspaceInitialized: boolean
  devReady: boolean
  gradleReady: boolean
  sourceReady: boolean
  moduleLockReady: boolean
  moduleWorkspaceReady: boolean
  artifactNames: string[]
}

const STORE_PATH = join('.echo-studio', 'codex-tasks.json')

function cloneManifest(manifest: AddonManifest): AddonManifest {
  return JSON.parse(JSON.stringify(manifest)) as AddonManifest
}

function appendUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value]
}

function taskLane(id: string, preferred: CodexTaskLane, store: CodexTaskStore): CodexTaskLane {
  return store.rejected[id] ? 'rejected' : preferred
}

async function ensureStudioDir(projectPath: string): Promise<string> {
  const dir = join(projectPath, '.echo-studio')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function readStore(projectPath: string): Promise<CodexTaskStore> {
  try {
    const parsed = JSON.parse(await fs.readFile(join(projectPath, STORE_PATH), 'utf8')) as Partial<CodexTaskStore>
    return {
      rejected: parsed.rejected ?? {},
      applied: parsed.applied ?? {}
    }
  } catch {
    return { rejected: {}, applied: {} }
  }
}

async function writeStore(projectPath: string, store: CodexTaskStore): Promise<void> {
  await ensureStudioDir(projectPath)
  await fs.writeFile(join(projectPath, STORE_PATH), JSON.stringify(store, null, 2), 'utf8')
}

function reportFromContext(context: {
  manifest: AddonManifest
  content: Record<ContentType, ContentRecord[]>
  langKeys: string[]
  assetFiles: string[]
  moduleCatalog: EchoModuleRecord[]
  devWorkspace?: DevWorkspaceState
}, overrides?: { manifest?: AddonManifest; langKeys?: string[] }): PackOSReport {
  const content: Record<string, { id: string; data: unknown }[]> = {}
  for (const [type, records] of Object.entries(context.content)) {
    content[type] = records.map((record) => ({ id: record.id, data: record.data }))
  }
  return runProjectCheck({
    manifest: overrides?.manifest ?? context.manifest,
    content: content as never,
    langKeys: overrides?.langKeys ?? context.langKeys,
    assetFiles: context.assetFiles,
    moduleCatalog: context.moduleCatalog,
    devWorkspace: context.devWorkspace
  })
}

async function loadContext(projectPath: string): Promise<ProjectContext> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const moduleCatalog = await listEchoModules(projectPath)
  const content = await readAllContent(projectPath)
  const langKeys = await readLangKeys(projectPath)
  const assetFiles = await listAssetFiles(projectPath)
  const devWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
  const report = reportFromContext({
    manifest,
    content,
    langKeys,
    assetFiles,
    moduleCatalog: moduleCatalog.catalog,
    devWorkspace
  })
  return {
    manifest,
    moduleCatalog: moduleCatalog.catalog,
    report,
    content,
    langKeys,
    assetFiles,
    devWorkspace,
    workspaceInitialized: Boolean(devWorkspace?.lastSetupAt),
    devReady: Boolean(devWorkspace?.ready),
    gradleReady: Boolean(devWorkspace?.gradleReady),
    sourceReady: Boolean(devWorkspace?.sourceReady),
    moduleLockReady: Boolean(devWorkspace?.moduleLock.upToDate),
    moduleWorkspaceReady: Boolean(devWorkspace?.moduleWorkspace.upToDate),
    artifactNames: devWorkspace?.artifacts.map((artifact) => artifact.name) ?? []
  }
}

async function manifestTask(
  store: CodexTaskStore,
  context: ProjectContext,
  id: string,
  title: string,
  summary: string,
  reason: string,
  proposed: AddonManifest
): Promise<CodexTask | null> {
  const before = jsonDocument(context.manifest)
  const after = jsonDocument(proposed)
  if (before === after) return null
  const afterReport = reportFromContext(context, { manifest: proposed })
  return {
    id,
    title,
    kind: id.includes('module') ? 'module_closure' : 'manifest_fix',
    lane: taskLane(id, 'waiting_review', store),
    summary,
    reason,
    route: id.includes('module') ? '/modules' : '/validation',
    affectedFiles: ['echo.mod.json'],
    fileChanges: [{
      path: 'echo.mod.json',
      before,
      after,
      diff: buildUnifiedTextDiff('echo.mod.json', before, after)
    }],
    canApply: true,
    applyLabel: 'Apply manifest change',
    rejectable: true,
    validationBefore: validationSnapshot(context.report),
    validationAfter: validationSnapshot(afterReport)
  }
}

async function moduleClosureTask(store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  const plan = resolveProjectModulePlan(context.manifest, context.moduleCatalog)
  if (plan.missingRequired.length === 0) return null
  const proposed = cloneManifest(context.manifest)
  const closureAliases = plan.closure.map(preferredModuleAlias)
  const missingAliases = plan.missingRequired.map(preferredModuleAlias)
  proposed.target.modules = closureAliases.reduce(appendUnique, [...proposed.target.modules])
  proposed.dependencies.required = missingAliases.reduce(appendUnique, [...proposed.dependencies.required])
  return manifestTask(
    store,
    context,
    'manifest:module-closure',
    'Repair module dependency closure',
    'Adds required ECHO module dependencies and target modules from the resolved catalog closure.',
    `${plan.missingRequired.length} required module(s) are missing: ${plan.missingRequired.map((mod) => mod.name).join(', ')}.`,
    proposed
  )
}

async function packosFixTask(store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  if (context.report.counts.BLOCKER === 0 && context.report.counts.ERROR === 0) return null
  return manifestTask(
    store,
    context,
    'manifest:packos-autofix',
    'Apply safe PackOS manifest fixes',
    'Uses Studio safety rules to repair reserved namespace usage, blocked permissions, missing core dependencies, empty runtimes, and missing tags.',
    `${context.report.counts.BLOCKER} blocker(s) and ${context.report.counts.ERROR} error(s) are present before release.`,
    autoFixManifest(context.manifest)
  )
}

function devWorkspaceTask(store: CodexTaskStore, context: ProjectContext): CodexTask | null {
  if (context.devReady) return null
  const missing = [
    !context.workspaceInitialized ? 'workspace setup' : '',
    !context.gradleReady ? 'Gradle files' : '',
    !context.sourceReady ? 'source scaffold' : '',
    !context.moduleLockReady ? 'module lock' : '',
    !context.moduleWorkspaceReady ? 'module source map' : ''
  ].filter(Boolean)
  return {
    id: 'dev:setup-workspace',
    title: context.workspaceInitialized ? 'Refresh local dev workspace' : 'Set up local Gradle workspace',
    kind: 'dev_workspace_setup',
    lane: taskLane('dev:setup-workspace', 'ready', store),
    summary: 'Generates or refreshes Gradle files, wrapper bootstraps, source folders, module locks, source maps, resources, scripts, and Studio workspace metadata without overwriting user files.',
    reason: missing.length ? `${missing.join(', ')} need attention.` : 'Local workspace is not marked ready.',
    route: '/dev-workspace',
    affectedFiles: ['.echo-studio/modules.lock.json', '.echo-studio/module-workspace.json', 'settings.gradle', 'build.gradle', 'gradle.properties', 'gradlew.bat', 'gradlew', 'src/', 'scripts/'],
    fileChanges: [],
    canApply: true,
    applyLabel: 'Set up workspace',
    rejectable: true,
    validationBefore: validationSnapshot(context.report)
  }
}

function releasePackageTask(store: CodexTaskStore, context: ProjectContext): CodexTask {
  const hasReleaseManifest = context.artifactNames.includes('echo-release.json')
  const hasChecksums = context.artifactNames.includes('checksums.sha256')
  const hasPackage = context.artifactNames.some((name) => name.endsWith('.echo-addon'))
  const ready = context.report.publishingReady && hasReleaseManifest && hasChecksums && hasPackage
  return {
    id: 'release:package-local',
    title: 'Prepare local release package',
    kind: 'release_package',
    lane: taskLane('release:package-local', ready ? 'suggested' : 'ready', store),
    summary: 'Builds the local .echo-addon package, checksums.sha256, echo-release.json, package manifest, Release Index handoff, submission notes, and GitHub release draft payload.',
    reason: ready
      ? 'Release assets exist; rerun this before publishing if project content changed.'
      : 'Release assets are missing or stale for the current local loop.',
    route: '/release',
    affectedFiles: ['exports/', 'release/', 'META-INF/echo-addon-package.json'],
    fileChanges: [],
    canApply: true,
    applyLabel: ready ? 'Rebuild release assets' : 'Package local release',
    rejectable: true,
    validationBefore: validationSnapshot(context.report)
  }
}

function manualValidationTask(store: CodexTaskStore, context: ProjectContext): CodexTask | null {
  if (context.report.counts.BLOCKER === 0 && context.report.counts.ERROR === 0 && context.report.counts.WARNING === 0) return null
  return {
    id: 'validation:manual-review',
    title: 'Review remaining validation output',
    kind: 'navigation',
    lane: taskLane('validation:manual-review', 'suggested', store),
    summary: 'Opens the full PackOS report for issues that need creator judgment or content-level fixes.',
    reason: `${context.report.counts.WARNING} warning(s), ${context.report.counts.ERROR} error(s), and ${context.report.counts.BLOCKER} blocker(s) are currently reported.`,
    route: '/validation',
    affectedFiles: [],
    fileChanges: [],
    canApply: false,
    rejectable: true,
    validationBefore: validationSnapshot(context.report)
  }
}

function flatId(id: string): string {
  return id.replace(':', '.')
}

function localId(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}

async function readLangDocument(projectPath: string): Promise<{ path: string; before: string; entries: Record<string, string> }> {
  const path = join(projectPath, 'lang', 'en_us.json')
  try {
    const before = await fs.readFile(path, 'utf8')
    const parsed = JSON.parse(before) as Record<string, unknown>
    const entries = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
    return { path, before, entries }
  } catch {
    return { path, before: '', entries: {} }
  }
}

async function missionLocalizationTask(projectPath: string, store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  const missions = context.content.mission.map((record) => record.data as Mission)
  if (missions.length === 0) return null

  const currentKeys = new Set(context.langKeys)
  const missing = missions
    .map((mission) => ({
      key: `mission.${flatId(mission.id)}`,
      value: mission.title?.trim() || localId(mission.id).replace(/[_-]+/g, ' ')
    }))
    .filter((entry) => !currentKeys.has(entry.key))
  if (missing.length === 0) return null

  const lang = await readLangDocument(projectPath)
  const nextEntries = { ...lang.entries }
  for (const entry of missing) nextEntries[entry.key] = entry.value
  const before = lang.before || '{}\n'
  const after = jsonDocument(Object.fromEntries(Object.entries(nextEntries).sort(([a], [b]) => a.localeCompare(b))))
  const afterReport = reportFromContext(context, {
    langKeys: [...context.langKeys, ...missing.map((entry) => entry.key)]
  })
  return {
    id: 'content:mission-localization',
    title: 'Generate missing mission localization',
    kind: 'localization_fix',
    lane: taskLane('content:mission-localization', 'waiting_review', store),
    summary: 'Adds missing mission localization keys to lang/en_us.json using each mission title as the default value.',
    reason: `${missing.length} mission localization key(s) are missing: ${missing.map((entry) => entry.key).join(', ')}.`,
    route: '/missions',
    affectedFiles: ['lang/en_us.json'],
    fileChanges: [{
      path: 'lang/en_us.json',
      before,
      after,
      diff: buildUnifiedTextDiff('lang/en_us.json', before, after)
    }],
    canApply: true,
    applyLabel: 'Write localization keys',
    rejectable: true,
    validationBefore: validationSnapshot(context.report),
    validationAfter: validationSnapshot(afterReport)
  }
}

export async function listCodexTasks(projectPath: string): Promise<CodexTask[]> {
  const store = await readStore(projectPath)
  const context = await loadContext(projectPath)
  const tasks = await Promise.all([
    moduleClosureTask(store, context),
    packosFixTask(store, context),
    missionLocalizationTask(projectPath, store, context),
    Promise.resolve(devWorkspaceTask(store, context)),
    Promise.resolve(manualValidationTask(store, context)),
    Promise.resolve(releasePackageTask(store, context))
  ])
  return tasks.filter((task): task is CodexTask => Boolean(task))
}

function defaultRuntimes(manifest: AddonManifest): Runtime[] {
  return manifest.runtime.supports.length ? manifest.runtime.supports : ['neoforge']
}

async function applyManifestProposal(projectPath: string, taskId: string): Promise<CodexTaskActionResult> {
  const tasks = await listCodexTasks(projectPath)
  const task = tasks.find((item) => item.id === taskId)
  if (!task?.fileChanges[0]?.after) throw new Error(`No manifest proposal is available for ${taskId}.`)
  const next = JSON.parse(task.fileChanges[0].after) as AddonManifest
  await writeManifest(projectPath, next)
  const store = await readStore(projectPath)
  delete store.rejected[taskId]
  store.applied[taskId] = new Date().toISOString()
  await writeStore(projectPath, store)
  return {
    taskId,
    message: `${task.title} applied.`,
    filesChanged: ['echo.mod.json']
  }
}

async function applyFileProposal(projectPath: string, taskId: string): Promise<CodexTaskActionResult> {
  const tasks = await listCodexTasks(projectPath)
  const task = tasks.find((item) => item.id === taskId)
  const change = task?.fileChanges[0]
  if (!change?.after) throw new Error(`No file proposal is available for ${taskId}.`)
  if (change.path !== 'lang/en_us.json') throw new Error(`Task ${taskId} cannot write ${change.path}.`)
  const target = join(projectPath, change.path)
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, change.after, 'utf8')
  const store = await readStore(projectPath)
  delete store.rejected[taskId]
  store.applied[taskId] = new Date().toISOString()
  await writeStore(projectPath, store)
  return {
    taskId,
    message: `${task?.title ?? taskId} applied.`,
    filesChanged: [change.path]
  }
}

export async function applyCodexTask(projectPath: string, taskId: string): Promise<CodexTaskActionResult> {
  if (taskId.startsWith('manifest:')) return applyManifestProposal(projectPath, taskId)
  if (taskId === 'content:mission-localization') return applyFileProposal(projectPath, taskId)

  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const store = await readStore(projectPath)
  delete store.rejected[taskId]
  store.applied[taskId] = new Date().toISOString()

  if (taskId === 'dev:setup-workspace') {
    const currentWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
    const devSetup = await setupDevWorkspace(projectPath, {
      mode: currentWorkspace?.lastSetupAt ? currentWorkspace.mode : 'gradle',
      runtimes: currentWorkspace?.runtimeTargets.length ? currentWorkspace.runtimeTargets : defaultRuntimes(manifest),
      force: false
    })
    await writeStore(projectPath, store)
    return {
      taskId,
      message: `Dev workspace setup wrote ${devSetup.written.length} file(s) and skipped ${devSetup.skipped.length}.`,
      filesChanged: devSetup.written,
      devSetup
    }
  }

  if (taskId === 'release:package-local') {
    const packageResult = await packageAddon(projectPath, await inspectDevWorkspace(projectPath))
    await writeStore(projectPath, store)
    return {
      taskId,
      message: `Prepared ${packageResult.assetPaths.length} release asset(s).`,
      filesChanged: packageResult.assetPaths,
      packageResult
    }
  }

  throw new Error(`Task ${taskId} does not have a direct apply action.`)
}

export async function setCodexTaskRejected(projectPath: string, taskId: string, rejected: boolean): Promise<CodexTask[]> {
  const store = await readStore(projectPath)
  if (rejected) store.rejected[taskId] = new Date().toISOString()
  else delete store.rejected[taskId]
  await writeStore(projectPath, store)
  return listCodexTasks(projectPath)
}
