import { runValidationCheck } from './validation'
import type { AddonManifest, ValidationReport, ValidationIssue } from './types'
import type { EchoModuleRecord } from './moduleCatalog'
import type { DevWorkspaceState } from './devWorkspace'
import type {
  ContentType,
  HoloMapLayer,
  IndexEntry,
  Mission,
  Recipe
} from './content/schemas'

export interface ProjectContent {
  mission: Mission[]
  recipe: Recipe[]
  holomap: HoloMapLayer[]
  index: IndexEntry[]
  item: { id: string }[]
}

export interface ProjectCheckInput {
  manifest: AddonManifest
  content: Partial<Record<ContentType, { id: string; data: unknown }[]>>
  langKeys: string[]
  assetFiles: string[] // relative paths under assets/
  moduleCatalog?: EchoModuleRecord[]
  devWorkspace?: DevWorkspaceState
  artifactReadiness?: 'current' | 'packaging'
}

// Runs the manifest safety check PLUS cross-content relationship validation,
// then merges everything into a single report (re-scored).
export function runProjectCheck(input: ProjectCheckInput): ValidationReport {
  const base = runValidationCheck(input.manifest, input.moduleCatalog)
  const extra: ValidationIssue[] = []

  const missions = pick<Mission>(input, 'mission')
  const recipes = pick<Recipe>(input, 'recipe')
  const layers = pick<HoloMapLayer>(input, 'holomap')
  const indexEntries = pick<IndexEntry>(input, 'index')
  const items = pick<{ id: string }>(input, 'item')

  // Build a set of all known content ids.
  const allIds = new Set<string>([
    ...missions.map((m) => m.id),
    ...recipes.map((r) => r.id),
    ...indexEntries.map((e) => e.id),
    ...items.map((i) => i.id),
    ...layers.flatMap((l) => l.markers.map((mk) => mk.id))
  ])
  const indexIds = new Set(indexEntries.map((e) => e.id))
  const itemIds = new Set(items.map((i) => i.id))
  const missionIds = new Set(missions.map((m) => m.id))

  // --- Duplicate IDs --------------------------------------------------------
  const seen = new Set<string>()
  for (const id of [...missions, ...recipes, ...indexEntries].map((x) => x.id)) {
    if (seen.has(id)) {
      extra.push({ level: 'ERROR', category: 'Content IDs', message: `Duplicate content ID: ${id}.`, aiFixable: false })
    }
    seen.add(id)
  }

  // --- Missions -------------------------------------------------------------
  for (const m of missions) {
    if ((m.rewards ?? []).length === 0) {
      extra.push({ level: 'WARNING', category: 'Missions', message: `Mission ${m.id} has no reward.`, fix: 'Add at least one reward.', file: `missions/${local(m.id)}.json`, aiFixable: true })
    }
    if (m.unlockAfter && !missionIds.has(m.unlockAfter)) {
      extra.push({ level: 'ERROR', category: 'Missions', message: `Mission ${m.id} unlock condition points to missing mission ${m.unlockAfter}.`, fix: 'Point to an existing mission or remove the unlock.', file: `missions/${local(m.id)}.json`, aiFixable: false })
    }
    if (m.objective.target && looksLikeId(m.objective.target) && !allIds.has(m.objective.target) && !itemIds.has(m.objective.target)) {
      extra.push({ level: 'WARNING', category: 'Missions', message: `Mission ${m.id} uses unknown target ID ${m.objective.target}.`, file: `missions/${local(m.id)}.json` })
    }
    if (m.holomapMarker && !markerExists(layers, m.holomapMarker)) {
      extra.push({
        level: 'WARNING',
        category: 'HoloMap',
        message: `Mission ${m.id} references missing HoloMap marker ${m.holomapMarker}.`,
        fix: 'Generate a HoloMap mission marker layer or link the mission to an existing marker.',
        file: `missions/${local(m.id)}.json`,
        aiFixable: true
      })
    }
    if (m.indexEntry && !indexIds.has(m.indexEntry)) {
      extra.push({ level: 'SUGGESTION', category: 'Index', message: `Mission ${m.id} references missing Index entry ${m.indexEntry}.`, aiFixable: true })
    }
  }

  // --- Recipes --------------------------------------------------------------
  for (const r of recipes) {
    for (const inp of r.inputs ?? []) {
      if (looksLikeId(inp.item) && !itemIds.has(inp.item) && !allIds.has(inp.item)) {
        extra.push({ level: 'WARNING', category: 'Recipes', message: `Recipe ${r.id} uses input item ${inp.item} that has no definition.`, file: `recipes/${local(r.id)}.json` })
      }
    }
    const outputItem = r.output?.item
    const linkedIndex = r.indexEntry?.trim()
    if (outputItem && !indexIds.has(outputItem)) {
      if (linkedIndex && !indexIds.has(linkedIndex)) {
        extra.push({
          level: 'SUGGESTION',
          category: 'Index',
          message: `Recipe ${r.id} references missing Index entry ${linkedIndex}.`,
          fix: 'Generate the linked Index entry for the recipe output.',
          file: `recipes/${local(r.id)}.json`,
          aiFixable: true
        })
      } else if (!linkedIndex && isProjectOwnedId(input.manifest, outputItem)) {
        extra.push({
          level: 'SUGGESTION',
          category: 'Index',
          message: `Recipe ${r.id} output ${outputItem} has no linked Index entry.`,
          fix: 'Add a recipe Index link and generate the output Index entry.',
          file: `recipes/${local(r.id)}.json`,
          aiFixable: true
        })
      }
    }
  }

  // Circular recipe dependency detection (output feeds another recipe's input).
  const cyc = detectRecipeCycle(recipes)
  if (cyc) {
    extra.push({ level: 'ERROR', category: 'Recipes', message: `Circular recipe dependency detected involving ${cyc}.`, aiFixable: false })
  }

  // --- HoloMap markers ------------------------------------------------------
  for (const l of layers) {
    for (const mk of l.markers) {
      if (mk.linkedMission && !missionIds.has(mk.linkedMission)) {
        extra.push({ level: 'WARNING', category: 'HoloMap', message: `Marker ${mk.id} references missing mission ${mk.linkedMission}.`, aiFixable: false })
      }
      const MAP_BOUNDS = 100 // Percentage-based coordinate system (0-100)
      if (mk.x < 0 || mk.x > MAP_BOUNDS || mk.z < 0 || mk.z > MAP_BOUNDS) {
        extra.push({ level: 'INFO', category: 'HoloMap', message: `Marker ${mk.id} is outside the valid region bounds (0-${MAP_BOUNDS}).` })
      }
    }
  }

  // --- Localization ---------------------------------------------------------
  const langSet = new Set(input.langKeys)
  for (const m of missions) {
    const key = `mission.${flat(m.id)}`
    if (input.langKeys.length > 0 && !langSet.has(key)) {
      extra.push({ level: 'SUGGESTION', category: 'Localization', message: `Missing localization key ${key} for mission ${m.id}.`, aiFixable: true })
    }
  }

  // --- Local developer workspace -------------------------------------------
  if (input.devWorkspace) {
    const expectsCodeWorkspace = input.devWorkspace.mode !== 'visual'
    if (expectsCodeWorkspace && !input.devWorkspace.gradleReady) {
      extra.push({
        level: 'WARNING',
        category: 'Dev Workspace',
        message: 'Gradle project files are not set up yet.',
        fix: 'Open Dev Workspace and run Set Up Workspace.',
        aiFixable: false
      })
    }
    if (expectsCodeWorkspace && !input.devWorkspace.sourceReady) {
      extra.push({
        level: 'SUGGESTION',
        category: 'Dev Workspace',
        message: 'Source scaffold is missing.',
        fix: 'Generate source folders from Dev Workspace before running local builds.',
        aiFixable: false
      })
    }
    if (expectsCodeWorkspace && !input.devWorkspace.toolchain.javaAvailable) {
      extra.push({
        level: 'WARNING',
        category: 'Toolchain',
        message: 'Java is not available for Gradle builds.',
        fix: `Install Java ${input.devWorkspace.toolchain.requiredJavaVersion} or add it to PATH before running local build and preview tasks.`,
        aiFixable: false
      })
    } else if (expectsCodeWorkspace && !input.devWorkspace.toolchain.javaMeetsRequirement) {
      extra.push({
        level: 'WARNING',
        category: 'Toolchain',
        message: `Java ${input.devWorkspace.toolchain.javaVersion ?? 'version'} is below the generated target ${input.devWorkspace.toolchain.requiredJavaVersion}.`,
        fix: `Use Java ${input.devWorkspace.toolchain.requiredJavaVersion} for generated Gradle workspaces.`,
        aiFixable: false
      })
    }
    if (expectsCodeWorkspace && !input.devWorkspace.toolchain.gradleAvailable) {
      extra.push({
        level: 'WARNING',
        category: 'Toolchain',
        message: 'No Gradle launcher is available for local build tasks.',
        fix: 'Run Dev Workspace setup to generate the pinned Gradle launcher, or install Gradle on PATH.',
        aiFixable: false
      })
    }
    if (input.devWorkspace.runtimeLaunchers.nativeExpected && !input.devWorkspace.runtimeLaunchers.nativeConfigured) {
      extra.push({
        level: 'WARNING',
        category: 'Runtime Preview',
        message: 'ECHO Native preview executable is not configured in the generated workspace.',
        fix: 'Set the ECHO Native executable in Settings, then run Set Up Workspace.',
        file: input.devWorkspace.runtimeLaunchers.gradlePropertiesPath,
        aiFixable: false
      })
    }
    if (input.devWorkspace.runtimeLaunchers.standaloneExpected && !input.devWorkspace.runtimeLaunchers.standaloneConfigured) {
      extra.push({
        level: 'WARNING',
        category: 'Runtime Preview',
        message: 'Standalone preview executable is not configured in the generated workspace.',
        fix: 'Set the Standalone executable in Settings, then run Set Up Workspace.',
        file: input.devWorkspace.runtimeLaunchers.gradlePropertiesPath,
        aiFixable: false
      })
    }
    if (!input.devWorkspace.moduleLock.studioExists) {
      extra.push({
        level: 'WARNING',
        category: 'ECHO Modules',
        message: 'ECHO module lock has not been generated.',
        fix: 'Open Dev Workspace and run Set Up Workspace to lock the current module closure.',
        aiFixable: false
      })
    } else if (!input.devWorkspace.moduleLock.upToDate) {
      const missing = input.devWorkspace.moduleLock.missingFromLock
      const extraIds = input.devWorkspace.moduleLock.extraInLock
      extra.push({
        level: 'ERROR',
        category: 'ECHO Modules',
        message: 'ECHO module lock is stale or incomplete.',
        fix: [
          'Open Dev Workspace and run Set Up Workspace to refresh generated module locks.',
          missing.length ? `Missing from lock: ${missing.join(', ')}.` : '',
          extraIds.length ? `No longer declared: ${extraIds.join(', ')}.` : ''
        ].filter(Boolean).join(' '),
        aiFixable: false
      })
    }
    if (!input.devWorkspace.moduleWorkspace.exists) {
      extra.push({
        level: 'WARNING',
        category: 'ECHO Modules',
        message: 'ECHO module workspace map has not been generated.',
        fix: 'Open Dev Workspace and run Set Up Workspace to write .echo-studio/module-workspace.json.',
        file: input.devWorkspace.moduleWorkspace.path,
        aiFixable: false
      })
    } else if (!input.devWorkspace.moduleWorkspace.upToDate) {
      extra.push({
        level: 'WARNING',
        category: 'ECHO Modules',
        message: 'ECHO module workspace map is stale.',
        fix: 'Open Dev Workspace and run Set Up Workspace to refresh local module source links.',
        file: input.devWorkspace.moduleWorkspace.path,
        aiFixable: false
      })
    }
    const gradleDependencyIssues = input.devWorkspace.moduleWorkspace.gradleDependencyIssues ?? []
    if (expectsCodeWorkspace && gradleDependencyIssues.length > 0) {
      extra.push({
        level: 'WARNING',
        category: 'ECHO Modules',
        message: 'Some local ECHO module builds are not wired as Gradle compile dependencies.',
        fix: `Add the missing local Gradle project dependencies to the selected module closure, then run Set Up Workspace again: ${gradleDependencyIssues.map((issue) => `${issue.moduleId} missing ${issue.missingProjectDependencies.join(', ')}`).join('; ')}.`,
        file: input.devWorkspace.moduleWorkspace.path,
        aiFixable: false
      })
    }
    const checkArtifactReadiness = input.artifactReadiness !== 'packaging'
    if (checkArtifactReadiness && input.devWorkspace.artifacts.length === 0) {
      extra.push({
        level: 'SUGGESTION',
        category: 'Release readiness',
        message: 'No local artifacts have been built yet.',
        fix: 'Run Build All or Prepare Release Assets before publishing.',
        aiFixable: false
      })
    }
    const hasReleaseManifest = input.devWorkspace.artifacts.some((artifact) => artifact.name === 'echo-release.json')
    const hasChecksums = input.devWorkspace.artifacts.some((artifact) => artifact.name === 'checksums.sha256')
    if (checkArtifactReadiness && input.devWorkspace.artifacts.length > 0 && (!hasReleaseManifest || !hasChecksums)) {
      extra.push({
        level: 'WARNING',
        category: 'Release readiness',
        message: 'Built artifacts are missing echo-release.json or checksums.sha256.',
        fix: 'Use Release to prepare release assets.',
        aiFixable: false
      })
    }
  }

  return mergeReport(base, extra, input)
}

function pick<T>(input: ProjectCheckInput, type: ContentType): T[] {
  return (input.content[type] ?? []).map((r) => r.data as T)
}
function local(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}
function flat(id: string): string {
  return id.replace(':', '.')
}
function looksLikeId(s: string): boolean {
  return s.includes(':')
}
function projectNamespace(manifest: AddonManifest): string {
  return manifest.namespace || local(manifest.id)
}
function isProjectOwnedId(manifest: AddonManifest, id: string): boolean {
  const namespace = projectNamespace(manifest)
  return Boolean(namespace && id.startsWith(`${namespace}:`))
}
function markerExists(layers: HoloMapLayer[], id: string): boolean {
  return layers.some((l) => l.markers.some((m) => m.id === id))
}

function detectRecipeCycle(recipes: Recipe[]): string | null {
  // Edge: recipe output item -> recipes that consume it.
  const byInput = new Map<string, Recipe[]>()
  for (const r of recipes) {
    for (const inp of r.inputs ?? []) {
      const list = byInput.get(inp.item) ?? []
      list.push(r)
      byInput.set(inp.item, list)
    }
  }
  const visiting = new Set<string>()
  const done = new Set<string>()
  let found: string | null = null
  const visit = (r: Recipe): void => {
    if (done.has(r.id) || found) return
    if (visiting.has(r.id)) {
      found = r.id
      return
    }
    visiting.add(r.id)
    const outputItem = r.output?.item
    if (outputItem) {
      for (const next of byInput.get(outputItem) ?? []) visit(next)
    }
    visiting.delete(r.id)
    done.add(r.id)
  }
  for (const r of recipes) visit(r)
  return found
}

function assetHealth(base: ValidationReport, input: ProjectCheckInput): number {
  if (!input.devWorkspace || input.artifactReadiness === 'packaging') return base.healthScore.assets
  if (input.devWorkspace.artifacts.length === 0) return 50
  const hasReleaseManifest = input.devWorkspace.artifacts.some((artifact) => artifact.name === 'echo-release.json')
  const hasChecksums = input.devWorkspace.artifacts.some((artifact) => artifact.name === 'checksums.sha256')
  return hasReleaseManifest && hasChecksums ? 100 : 65
}

function mergeReport(base: ValidationReport, extra: ValidationIssue[], input: ProjectCheckInput): ValidationReport {
  const issues = [...base.issues, ...extra]
  const counts = { BLOCKER: 0, ERROR: 0, WARNING: 0, INFO: 0, SUGGESTION: 0 }
  for (const i of issues) counts[i.level]++
  let score = 100 - counts.BLOCKER * 25 - counts.ERROR * 8 - counts.WARNING * 3 - counts.SUGGESTION
  score = Math.max(0, Math.min(100, score))
  const publishingReady = counts.BLOCKER === 0 && counts.ERROR === 0
  return {
    ...base,
    issues,
    counts,
    compatibilityScore: score,
    publishingReady,
    healthScore: {
      ...base.healthScore,
      compatibility: score,
      assets: assetHealth(base, input),
      publishing: publishingReady ? 'Ready' : 'Not Ready'
    }
  }
}
