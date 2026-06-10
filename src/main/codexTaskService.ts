import { promises as fs } from 'fs'
import { join } from 'path'
import { autoFixManifest } from '../shared/validation'
import {
  buildUnifiedTextDiff,
  jsonDocument,
  validationSnapshot,
  type CodexTask,
  type CodexTaskActionResult,
  type CodexTaskLane
} from '../shared/codexTasks'
import { resolveProjectModulePlan, type EchoModuleRecord } from '../shared/moduleCatalog'
import type { AddonManifest, PackOSReport, Runtime } from '../shared/types'
import { runProjectCheck } from '../shared/projectValidation'
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
  devReady: boolean
  gradleReady: boolean
  sourceReady: boolean
  artifactNames: string[]
}

const STORE_PATH = join('.echo-studio', 'codex-tasks.json')

function cloneManifest(manifest: AddonManifest): AddonManifest {
  return JSON.parse(JSON.stringify(manifest)) as AddonManifest
}

function manifestAlias(mod: EchoModuleRecord): string {
  return mod.aliases.find((alias) => alias.startsWith('echo:') && alias.includes('_'))
    ?? mod.aliases.find((alias) => alias.startsWith('echo:'))
    ?? mod.id
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

async function projectReport(projectPath: string, manifest: AddonManifest, moduleCatalog: EchoModuleRecord[]): Promise<PackOSReport> {
  const all = await readAllContent(projectPath)
  const content: Record<string, { id: string; data: unknown }[]> = {}
  for (const [type, records] of Object.entries(all)) {
    content[type] = records.map((record) => ({ id: record.id, data: record.data }))
  }
  const langKeys = await readLangKeys(projectPath)
  const assetFiles = await listAssetFiles(projectPath)
  const devWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
  return runProjectCheck({
    manifest,
    content: content as never,
    langKeys,
    assetFiles,
    moduleCatalog,
    devWorkspace
  })
}

async function loadContext(projectPath: string): Promise<ProjectContext> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const moduleCatalog = await listEchoModules(projectPath)
  const report = await projectReport(projectPath, manifest, moduleCatalog.catalog)
  const devWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
  return {
    manifest,
    moduleCatalog: moduleCatalog.catalog,
    report,
    devReady: Boolean(devWorkspace?.ready),
    gradleReady: Boolean(devWorkspace?.gradleReady),
    sourceReady: Boolean(devWorkspace?.sourceReady),
    artifactNames: devWorkspace?.artifacts.map((artifact) => artifact.name) ?? []
  }
}

async function manifestTask(
  projectPath: string,
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
  const afterReport = await projectReport(projectPath, proposed, context.moduleCatalog)
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

async function moduleClosureTask(projectPath: string, store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  const plan = resolveProjectModulePlan(context.manifest, context.moduleCatalog)
  if (plan.missingRequired.length === 0) return null
  const proposed = cloneManifest(context.manifest)
  const closureAliases = plan.closure.map(manifestAlias)
  const missingAliases = plan.missingRequired.map(manifestAlias)
  proposed.target.modules = closureAliases.reduce(appendUnique, [...proposed.target.modules])
  proposed.dependencies.required = missingAliases.reduce(appendUnique, [...proposed.dependencies.required])
  return manifestTask(
    projectPath,
    store,
    context,
    'manifest:module-closure',
    'Repair module dependency closure',
    'Adds required ECHO module dependencies and target modules from the resolved catalog closure.',
    `${plan.missingRequired.length} required module(s) are missing: ${plan.missingRequired.map((mod) => mod.name).join(', ')}.`,
    proposed
  )
}

async function packosFixTask(projectPath: string, store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  if (context.report.counts.BLOCKER === 0 && context.report.counts.ERROR === 0) return null
  return manifestTask(
    projectPath,
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
    !context.gradleReady ? 'Gradle files' : '',
    !context.sourceReady ? 'source scaffold' : ''
  ].filter(Boolean)
  return {
    id: 'dev:setup-workspace',
    title: 'Set up local Gradle workspace',
    kind: 'dev_workspace_setup',
    lane: taskLane('dev:setup-workspace', 'ready', store),
    summary: 'Generates Gradle files, wrapper bootstraps, source folders, resources, scripts, and Studio workspace metadata without overwriting user files.',
    reason: missing.length ? `${missing.join(' and ')} are missing.` : 'Local workspace is not marked ready.',
    route: '/dev-workspace',
    affectedFiles: ['settings.gradle', 'build.gradle', 'gradle.properties', 'gradlew.bat', 'gradlew', 'src/', 'scripts/'],
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
    summary: 'Builds the local .echo-addon package, checksums.sha256, echo-release.json, package manifest, and GitHub release draft payload.',
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

export async function listCodexTasks(projectPath: string): Promise<CodexTask[]> {
  const store = await readStore(projectPath)
  const context = await loadContext(projectPath)
  const tasks = await Promise.all([
    moduleClosureTask(projectPath, store, context),
    packosFixTask(projectPath, store, context),
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

export async function applyCodexTask(projectPath: string, taskId: string): Promise<CodexTaskActionResult> {
  if (taskId.startsWith('manifest:')) return applyManifestProposal(projectPath, taskId)

  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const store = await readStore(projectPath)
  delete store.rejected[taskId]
  store.applied[taskId] = new Date().toISOString()

  if (taskId === 'dev:setup-workspace') {
    const devSetup = await setupDevWorkspace(projectPath, {
      mode: 'gradle',
      runtimes: defaultRuntimes(manifest),
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
    const packageResult = await packageAddon(projectPath)
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
