import { promises as fs } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { autoFixManifest } from '../shared/validation'
import {
  buildUnifiedTextDiff,
  jsonDocument,
  validationSnapshot,
  type CodexTask,
  type CodexTaskActionResult,
  type CodexTaskLane
} from '../shared/codexTasks'
import { addRequiredModuleClosureToManifest, resolveProjectModulePlan, type EchoModuleCatalogResult, type EchoModuleRecord } from '../shared/moduleCatalog'
import type { AddonManifest, PackOSReport, Runtime } from '../shared/types'
import type { DevWorkspaceState } from '../shared/devWorkspace'
import { runProjectCheck } from '../shared/projectValidation'
import type { ContentRecord, ContentType, HoloMapLayer, HoloMapMarker, IndexEntry, Mission, Recipe } from '../shared/content/schemas'
import { idToFileName } from '../shared/content/paths'
import { listAssetFiles, readManifest, writeManifest } from './fsService'
import { readAllContent, readLangKeys } from './contentService'
import { inspectDevWorkspace, setupDevWorkspace } from './devWorkspaceService'
import { packageAddon } from './packageService'
import { listEchoModules } from './moduleCatalogService'
import { getConfig } from './config'

interface CodexTaskStore {
  rejected: Record<string, string>
  applied: Record<string, string>
}

interface ProjectContext {
  manifest: AddonManifest
  moduleCatalog: EchoModuleRecord[]
  moduleCatalogResult: EchoModuleCatalogResult
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
  runtimeLaunchersReady: boolean
  releasePackageReady: boolean
  releaseSidecarsReady: boolean
  artifactNames: string[]
}

const STORE_PATH = join('.echo-studio', 'codex-tasks.json')

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
}, overrides?: { manifest?: AddonManifest; langKeys?: string[]; content?: Record<ContentType, ContentRecord[]> }): PackOSReport {
  const content: Record<string, { id: string; data: unknown }[]> = {}
  for (const [type, records] of Object.entries(overrides?.content ?? context.content)) {
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
    moduleCatalogResult: moduleCatalog,
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
    runtimeLaunchersReady: Boolean(devWorkspace?.runtimeLaunchers.ready),
    releasePackageReady: Boolean(devWorkspace?.artifacts.some((artifact) => artifact.name.endsWith('.echo-addon'))),
    releaseSidecarsReady: Boolean(
      devWorkspace?.artifacts.some((artifact) => artifact.name === 'echo-release.json') &&
      devWorkspace.artifacts.some((artifact) => artifact.name === 'checksums.sha256')
    ),
    artifactNames: devWorkspace?.artifacts.map((artifact) => artifact.name) ?? []
  }
}

function moduleCatalogSetupTask(store: CodexTaskStore, context: ProjectContext): CodexTask | null {
  const usingLocalCatalog = context.moduleCatalogResult.source === 'local-index'
  const hasWarnings = context.moduleCatalogResult.warnings.length > 0
  if (usingLocalCatalog && !hasWarnings) return null
  return {
    id: 'modules:configure-local-catalog',
    title: usingLocalCatalog ? 'Review ECHO-Modules catalog warnings' : 'Connect a local ECHO-Modules catalog',
    kind: 'module_catalog_setup',
    lane: taskLane('modules:configure-local-catalog', 'suggested', store),
    summary: 'Opens Settings so Studio can use a pinned ECHO-Modules checkout or index override for generated module metadata, local source links, and module Gradle builds.',
    reason: hasWarnings
      ? context.moduleCatalogResult.warnings.join(' ')
      : 'Studio is using the built-in starter module catalog. Pin a local ECHO-Modules checkout for full local module integration.',
    route: '/settings',
    affectedFiles: context.moduleCatalogResult.indexPath ? [context.moduleCatalogResult.indexPath] : ['metadata/modules/index.json'],
    fileChanges: [],
    canApply: false,
    rejectable: true,
    validationBefore: validationSnapshot(context.report)
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
  const proposed = addRequiredModuleClosureToManifest(context.manifest, plan.closure, context.moduleCatalog)
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
    'Apply safe validation fixes',
    'Uses Studio safety rules to repair reserved namespace usage, blocked permissions, missing core dependencies, empty runtimes, and missing tags.',
    `${context.report.counts.BLOCKER} blocker(s) and ${context.report.counts.ERROR} error(s) are present before release.`,
    autoFixManifest(context.manifest, context.moduleCatalog)
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

function previewLauncherTask(store: CodexTaskStore, context: ProjectContext): CodexTask | null {
  if (!context.devWorkspace?.lastSetupAt || context.runtimeLaunchersReady) return null
  const missing = [
    context.devWorkspace.runtimeLaunchers.nativeExpected && !context.devWorkspace.runtimeLaunchers.nativeConfigured ? 'ECHO Native executable' : '',
    context.devWorkspace.runtimeLaunchers.standaloneExpected && !context.devWorkspace.runtimeLaunchers.standaloneConfigured ? 'Standalone executable' : ''
  ].filter(Boolean)
  if (missing.length === 0) return null
  return {
    id: 'preview:configure-runtime-launchers',
    title: 'Configure preview runtime launchers',
    kind: 'runtime_preview_setup',
    lane: taskLane('preview:configure-runtime-launchers', 'suggested', store),
    summary: 'Points Settings at local ECHO Native or Standalone runtime executables, then Dev Workspace setup can write them into gradle.properties.',
    reason: `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} missing for selected preview targets.`,
    route: '/settings',
    affectedFiles: [context.devWorkspace.runtimeLaunchers.gradlePropertiesPath],
    fileChanges: [],
    canApply: false,
    rejectable: true,
    validationBefore: validationSnapshot(context.report)
  }
}

function releasePackageTask(store: CodexTaskStore, context: ProjectContext): CodexTask {
  const ready = context.report.publishingReady && context.releaseSidecarsReady && context.releasePackageReady
  return {
    id: 'release:package-local',
    title: 'Prepare local release package',
    kind: 'release_package',
    lane: taskLane('release:package-local', ready ? 'suggested' : 'ready', store),
    summary: 'Builds the local .echo-addon package, checksums.sha256, echo-release.json, package manifest, Release Index handoff, review notes, and GitHub release draft payload.',
    reason: ready
      ? 'Release assets exist; rerun this before publishing if project content changed.'
      : context.releasePackageReady && !context.releaseSidecarsReady
        ? 'Runtime packages exist, but Release Index sidecars or checksums are missing.'
        : `Release artifact health is ${context.report.healthScore.assets}%; local packages or sidecars are missing for the current loop.`,
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
    summary: 'Opens the full validation report for issues that need creator judgment or content-level fixes.',
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

function projectNamespace(manifest: AddonManifest): string {
  return manifest.namespace || localId(manifest.id)
}

function isProjectOwnedId(manifest: AddonManifest, id: string): boolean {
  const namespace = projectNamespace(manifest)
  return Boolean(namespace && id.startsWith(`${namespace}:`))
}

function relativeProjectPath(projectPath: string, filePath: string): string {
  return relative(projectPath, filePath).replace(/\\/g, '/')
}

function defaultRewardItem(manifest: AddonManifest): string {
  return `${manifest.namespace || localId(manifest.id)}:reward`
}

function titleFromId(id: string): string {
  return localId(id)
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function combineTags(...groups: Array<string[] | undefined>): string[] | undefined {
  const tags = groups.flatMap((group) => group ?? []).filter(Boolean)
  return tags.length ? [...new Set(tags)] : undefined
}

function mergeIndexProposal(current: IndexEntry | undefined, next: IndexEntry): IndexEntry {
  if (!current) return next
  return {
    ...current,
    title: current.title || next.title,
    type: current.type || next.type,
    category: current.category || next.category,
    description: current.description || next.description,
    icon: current.icon || next.icon,
    relatedRecipes: [...new Set([...(current.relatedRecipes ?? []), ...(next.relatedRecipes ?? [])])],
    relatedMissions: [...new Set([...(current.relatedMissions ?? []), ...(next.relatedMissions ?? [])])],
    relatedMarkers: [...new Set([...(current.relatedMarkers ?? []), ...(next.relatedMarkers ?? [])])],
    tags: combineTags(current.tags, next.tags)
  }
}

function missionIndexEntry(manifest: AddonManifest, mission: Mission): IndexEntry | null {
  if (!mission.indexEntry) return null
  const title = mission.title?.trim() || titleFromId(mission.id)
  return {
    id: mission.indexEntry,
    title,
    type: 'mission',
    category: 'missions',
    description: mission.description?.trim() || `Guide entry for ${title}.`,
    relatedMissions: [mission.id],
    tags: combineTags(['mission'], [manifest.namespace])
  }
}

function defaultRecipeIndexEntryId(manifest: AddonManifest, recipe: Recipe): string {
  const outputItem = recipe.output?.item || recipe.id || 'recipe_output'
  return `${projectNamespace(manifest)}:${localId(outputItem)}_entry`
}

function recipeIndexEntry(manifest: AddonManifest, recipe: Recipe, entryId = recipe.indexEntry): IndexEntry | null {
  const outputItem = recipe.output?.item
  if (!entryId || !outputItem) return null
  const title = titleFromId(outputItem)
  const recipeTitle = titleFromId(recipe.id)
  return {
    id: entryId,
    title,
    type: 'item',
    category: 'recipes',
    description: `Output item produced by ${recipeTitle}.`,
    relatedRecipes: [recipe.id],
    tags: combineTags(['recipe', recipe.type], [manifest.namespace])
  }
}

function allHoloMapMarkerIds(layers: ContentRecord[]): Set<string> {
  return new Set(layers.flatMap((record) => (record.data as HoloMapLayer).markers?.map((marker) => marker.id) ?? []))
}

function missionMarker(mission: Mission, index: number): HoloMapMarker | null {
  if (!mission.holomapMarker) return null
  return {
    id: mission.holomapMarker,
    title: mission.title?.trim() || titleFromId(mission.id),
    description: mission.description,
    icon: 'mission',
    x: 20 + ((index * 17) % 60),
    z: 25 + ((index * 23) % 50),
    visibleByDefault: true,
    linkedMission: mission.id,
    ...(mission.indexEntry ? { linkedIndex: mission.indexEntry } : {})
  }
}

function mergeMarkers(current: HoloMapMarker[], next: HoloMapMarker[]): HoloMapMarker[] {
  const byId = new Map(current.map((marker) => [marker.id, marker]))
  for (const marker of next) {
    byId.set(marker.id, {
      ...marker,
      ...(byId.get(marker.id) ?? {})
    })
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
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

async function holomapMarkersTask(projectPath: string, store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  const markerIds = allHoloMapMarkerIds(context.content.holomap)
  const missingMarkers = context.content.mission
    .map((record, index) => missionMarker(record.data as Mission, index))
    .filter((marker): marker is HoloMapMarker => Boolean(marker && !markerIds.has(marker.id)))
  if (missingMarkers.length === 0) return null

  const changePath = 'holomap/mission_markers.json'
  const absolutePath = join(projectPath, changePath)
  const existingRecord = context.content.holomap.find((record) => relativeProjectPath(projectPath, record.path) === changePath)
  const existingLayer = existingRecord?.data as HoloMapLayer | undefined
  const before = await fs.readFile(absolutePath, 'utf8').catch(() => '')
  const nextLayer: HoloMapLayer = {
    id: existingLayer?.id || `${context.manifest.namespace}:mission_markers`,
    title: existingLayer?.title || 'Mission Markers',
    type: existingLayer?.type || 'mission_route',
    markers: mergeMarkers(existingLayer?.markers ?? [], missingMarkers)
  }
  const after = jsonDocument(nextLayer)
  const nextRecord: ContentRecord<HoloMapLayer> = {
    id: nextLayer.id,
    fileName: 'mission_markers.json',
    path: absolutePath,
    data: nextLayer
  }
  const nextHolomap = [
    ...context.content.holomap.filter((record) => relativeProjectPath(projectPath, record.path) !== changePath),
    nextRecord
  ]
  const afterReport = reportFromContext(context, {
    content: {
      ...context.content,
      holomap: nextHolomap
    }
  })
  return {
    id: 'content:holomap-markers',
    title: 'Generate missing HoloMap mission markers',
    kind: 'holomap_marker_fix',
    lane: taskLane('content:holomap-markers', 'waiting_review', store),
    summary: 'Creates a mission marker layer for missions that reference missing HoloMap marker IDs.',
    reason: `${missingMarkers.length} HoloMap marker${missingMarkers.length === 1 ? ' is' : 's are'} missing: ${missingMarkers.map((marker) => marker.id).join(', ')}.`,
    route: '/holomap',
    affectedFiles: [changePath],
    fileChanges: [{
      path: changePath,
      before,
      after,
      diff: buildUnifiedTextDiff(changePath, before, after)
    }],
    canApply: true,
    applyLabel: missingMarkers.length === 1 ? 'Write HoloMap marker' : 'Write HoloMap markers',
    rejectable: true,
    validationBefore: validationSnapshot(context.report),
    validationAfter: validationSnapshot(afterReport)
  }
}

async function indexEntriesTask(projectPath: string, store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  const existingIds = new Set(context.content.index.map((record) => record.id))
  const proposals = new Map<string, IndexEntry>()
  const linkedRecipes = new Map<string, ContentRecord<Recipe>>()

  for (const record of context.content.mission) {
    const mission = record.data as Mission
    const entry = missionIndexEntry(context.manifest, mission)
    if (entry && !existingIds.has(entry.id)) {
      proposals.set(entry.id, mergeIndexProposal(proposals.get(entry.id), entry))
    }
  }

  for (const record of context.content.recipe) {
    const recipe = record.data as Recipe
    const outputItem = recipe.output?.item
    if (!outputItem || existingIds.has(outputItem)) continue

    const explicitIndex = recipe.indexEntry?.trim()
    const entryId = explicitIndex || (isProjectOwnedId(context.manifest, outputItem) ? defaultRecipeIndexEntryId(context.manifest, recipe) : '')
    const entry = recipeIndexEntry(context.manifest, recipe, entryId)
    if (entry && !existingIds.has(entry.id)) {
      proposals.set(entry.id, mergeIndexProposal(proposals.get(entry.id), entry))
    }
    if (entry && !explicitIndex) {
      linkedRecipes.set(record.path, {
        ...record,
        data: {
          ...recipe,
          indexEntry: entry.id
        }
      })
    }
  }

  if (proposals.size === 0 && linkedRecipes.size === 0) return null

  const entries = [...proposals.values()].sort((a, b) => a.id.localeCompare(b.id))
  const recipeChanges = await Promise.all([...linkedRecipes.values()].map(async (record) => {
    const before = await fs.readFile(record.path, 'utf8').catch(() => jsonDocument(record.data))
    const after = jsonDocument(record.data)
    const path = relativeProjectPath(projectPath, record.path)
    return {
      path,
      before,
      after,
      diff: buildUnifiedTextDiff(path, before, after)
    }
  }))
  const indexChanges = await Promise.all(entries.map(async (entry) => {
    const path = `index/${idToFileName(entry.id)}`
    const absolutePath = join(projectPath, path)
    const before = await fs.readFile(absolutePath, 'utf8').catch(() => '')
    const after = jsonDocument(entry)
    return {
      path,
      before,
      after,
      diff: buildUnifiedTextDiff(path, before, after)
    }
  }))
  const fileChanges = [...recipeChanges, ...indexChanges]

  const nextIndexRecords: ContentRecord<IndexEntry>[] = entries.map((entry) => {
    const fileName = idToFileName(entry.id)
    return {
      id: entry.id,
      fileName,
      path: join(projectPath, 'index', fileName),
      data: entry
    }
  })
  const nextRecipeRecords = context.content.recipe.map((record) => linkedRecipes.get(record.path) ?? record)
  const afterReport = reportFromContext(context, {
    content: {
      ...context.content,
      recipe: nextRecipeRecords,
      index: [...context.content.index, ...nextIndexRecords]
    }
  })
  const generatedCount = entries.length
  const linkedCount = linkedRecipes.size
  const changedIds = [
    ...[...linkedRecipes.values()].map((record) => (record.data as Recipe).indexEntry).filter(Boolean),
    ...entries.map((entry) => entry.id)
  ]
  return {
    id: 'content:index-entries',
    title: 'Generate missing recipe and mission Index links',
    kind: 'index_entry_fix',
    lane: taskLane('content:index-entries', 'waiting_review', store),
    summary: 'Creates Index entries referenced by missions and recipe outputs, and links project-owned recipe outputs to generated Index entries when needed.',
    reason: [
      generatedCount ? `${generatedCount} Index entr${generatedCount === 1 ? 'y is' : 'ies are'} missing` : '',
      linkedCount ? `${linkedCount} recipe${linkedCount === 1 ? ' needs' : 's need'} an Index link` : '',
      changedIds.length ? `(${[...new Set(changedIds)].join(', ')})` : ''
    ].filter(Boolean).join(' '),
    route: linkedCount ? '/recipes' : '/index',
    affectedFiles: fileChanges.map((change) => change.path),
    fileChanges,
    canApply: true,
    applyLabel: fileChanges.length === 1 ? 'Write Index fix' : 'Write Index fixes',
    rejectable: true,
    validationBefore: validationSnapshot(context.report),
    validationAfter: validationSnapshot(afterReport)
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

async function missionRewardsTask(projectPath: string, store: CodexTaskStore, context: ProjectContext): Promise<CodexTask | null> {
  const missingRewardRecords = context.content.mission.filter((record) => {
    const mission = record.data as Mission
    return !mission.rewards?.length
  })
  if (missingRewardRecords.length === 0) return null

  const rewardItem = defaultRewardItem(context.manifest)
  const fileChanges = await Promise.all(missingRewardRecords.map(async (record) => {
    const mission = record.data as Mission
    const before = await fs.readFile(record.path, 'utf8').catch(() => jsonDocument(mission))
    const after = jsonDocument({
      ...mission,
      rewards: [{ item: rewardItem, count: 1 }]
    })
    return {
      path: relativeProjectPath(projectPath, record.path),
      before,
      after,
      diff: buildUnifiedTextDiff(relativeProjectPath(projectPath, record.path), before, after)
    }
  }))

  const nextContent = {
    ...context.content,
    mission: context.content.mission.map((record) => (
      missingRewardRecords.some((missing) => missing.path === record.path)
        ? {
            ...record,
            data: {
              ...(record.data as Mission),
              rewards: [{ item: rewardItem, count: 1 }]
            }
          }
        : record
    ))
  }
  const afterReport = reportFromContext(context, { content: nextContent })
  return {
    id: 'content:mission-rewards',
    title: 'Add starter mission rewards',
    kind: 'mission_reward_fix',
    lane: taskLane('content:mission-rewards', 'waiting_review', store),
    summary: 'Adds a one-item starter reward to missions that currently complete without rewards.',
    reason: `${missingRewardRecords.length} mission(s) have no reward: ${missingRewardRecords.map((record) => record.id).join(', ')}.`,
    route: '/missions',
    affectedFiles: fileChanges.map((change) => change.path),
    fileChanges,
    canApply: true,
    applyLabel: missingRewardRecords.length === 1 ? 'Write mission reward' : 'Write mission rewards',
    rejectable: true,
    validationBefore: validationSnapshot(context.report),
    validationAfter: validationSnapshot(afterReport)
  }
}

export async function listCodexTasks(projectPath: string): Promise<CodexTask[]> {
  const store = await readStore(projectPath)
  const context = await loadContext(projectPath)
  const tasks = await Promise.all([
    Promise.resolve(moduleCatalogSetupTask(store, context)),
    moduleClosureTask(store, context),
    packosFixTask(store, context),
    indexEntriesTask(projectPath, store, context),
    holomapMarkersTask(projectPath, store, context),
    missionLocalizationTask(projectPath, store, context),
    missionRewardsTask(projectPath, store, context),
    Promise.resolve(devWorkspaceTask(store, context)),
    Promise.resolve(previewLauncherTask(store, context)),
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

function assertAllowedFileChange(projectPath: string, taskId: string, changePath: string): string {
  const normalized = changePath.replace(/\\/g, '/')
  const allowed =
    (taskId === 'content:mission-localization' && normalized === 'lang/en_us.json') ||
    (taskId === 'content:mission-rewards' && /^missions\/[A-Za-z0-9._-]+\.json$/.test(normalized)) ||
    (taskId === 'content:index-entries' && /^(index|recipes)\/[A-Za-z0-9._-]+\.json$/.test(normalized)) ||
    (taskId === 'content:holomap-markers' && normalized === 'holomap/mission_markers.json')
  if (!allowed) throw new Error(`Task ${taskId} cannot write ${changePath}.`)
  const target = resolve(projectPath, normalized)
  const root = resolve(projectPath)
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) {
    throw new Error(`Task ${taskId} cannot write outside the project.`)
  }
  return target
}

async function applyFileProposal(projectPath: string, taskId: string): Promise<CodexTaskActionResult> {
  const tasks = await listCodexTasks(projectPath)
  const task = tasks.find((item) => item.id === taskId)
  const changes = task?.fileChanges ?? []
  if (!changes.length || changes.some((change) => !change.after)) throw new Error(`No file proposal is available for ${taskId}.`)
  const written: string[] = []
  for (const change of changes) {
    const target = assertAllowedFileChange(projectPath, taskId, change.path)
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, change.after!, 'utf8')
    written.push(change.path)
  }
  const store = await readStore(projectPath)
  delete store.rejected[taskId]
  store.applied[taskId] = new Date().toISOString()
  await writeStore(projectPath, store)
  return {
    taskId,
    message: `${task?.title ?? taskId} applied.`,
    filesChanged: written
  }
}

export async function applyCodexTask(projectPath: string, taskId: string): Promise<CodexTaskActionResult> {
  if (taskId.startsWith('manifest:')) return applyManifestProposal(projectPath, taskId)
  if (taskId === 'content:mission-localization') return applyFileProposal(projectPath, taskId)
  if (taskId === 'content:mission-rewards') return applyFileProposal(projectPath, taskId)
  if (taskId === 'content:index-entries') return applyFileProposal(projectPath, taskId)
  if (taskId === 'content:holomap-markers') return applyFileProposal(projectPath, taskId)

  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const store = await readStore(projectPath)
  delete store.rejected[taskId]
  store.applied[taskId] = new Date().toISOString()

  if (taskId === 'dev:setup-workspace') {
    const currentWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
    const config = await getConfig()
    const devSetup = await setupDevWorkspace(projectPath, {
      mode: currentWorkspace?.lastSetupAt ? currentWorkspace.mode : 'gradle',
      runtimes: currentWorkspace?.runtimeTargets.length ? currentWorkspace.runtimeTargets : defaultRuntimes(manifest),
      force: false,
      runtimeTools: {
        echoNativeExecutable: config.runtimeTools.echoNativeExecutable,
        standaloneExecutable: config.runtimeTools.standaloneExecutable
      }
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
