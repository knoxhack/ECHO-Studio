import { runPackOSCheck } from './validation'
import type { AddonManifest, PackOSReport, ValidationIssue } from './types'
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
}

// Runs the manifest PackOS check PLUS cross-content relationship validation,
// then merges everything into a single report (re-scored).
export function runProjectCheck(input: ProjectCheckInput): PackOSReport {
  const base = runPackOSCheck(input.manifest, input.moduleCatalog)
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
    if (m.rewards.length === 0) {
      extra.push({ level: 'WARNING', category: 'Missions', message: `Mission ${m.id} has no reward.`, fix: 'Add at least one reward.', file: `missions/${local(m.id)}.json`, aiFixable: true })
    }
    if (m.unlockAfter && !missionIds.has(m.unlockAfter)) {
      extra.push({ level: 'ERROR', category: 'Missions', message: `Mission ${m.id} unlock condition points to missing mission ${m.unlockAfter}.`, fix: 'Point to an existing mission or remove the unlock.', file: `missions/${local(m.id)}.json`, aiFixable: false })
    }
    if (m.objective.target && looksLikeId(m.objective.target) && !allIds.has(m.objective.target) && !itemIds.has(m.objective.target)) {
      extra.push({ level: 'WARNING', category: 'Missions', message: `Mission ${m.id} uses unknown target ID ${m.objective.target}.`, file: `missions/${local(m.id)}.json` })
    }
    if (m.holomapMarker && !markerExists(layers, m.holomapMarker)) {
      extra.push({ level: 'WARNING', category: 'HoloMap', message: `Mission ${m.id} references missing HoloMap marker ${m.holomapMarker}.`, aiFixable: false })
    }
    if (m.indexEntry && !indexIds.has(m.indexEntry)) {
      extra.push({ level: 'SUGGESTION', category: 'Index', message: `Mission ${m.id} references missing Index entry ${m.indexEntry}.`, aiFixable: true })
    }
  }

  // --- Recipes --------------------------------------------------------------
  for (const r of recipes) {
    for (const inp of r.inputs) {
      if (looksLikeId(inp.item) && !itemIds.has(inp.item) && !allIds.has(inp.item)) {
        extra.push({ level: 'WARNING', category: 'Recipes', message: `Recipe ${r.id} uses input item ${inp.item} that has no definition.`, file: `recipes/${local(r.id)}.json` })
      }
    }
    if (!indexIds.has(r.output.item) && r.indexEntry && !indexIds.has(r.indexEntry)) {
      extra.push({ level: 'SUGGESTION', category: 'Index', message: `Recipe ${r.id} output ${r.output.item} has no Index entry.`, fix: 'Generate an Index entry for the output.', aiFixable: true })
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
      const MAP_BOUNDS = 100 // Percentage-based coordinate system (0–100)
      if (mk.x < 0 || mk.x > MAP_BOUNDS || mk.z < 0 || mk.z > MAP_BOUNDS) {
        extra.push({ level: 'INFO', category: 'HoloMap', message: `Marker ${mk.id} is outside the valid region bounds (0–${MAP_BOUNDS}).` })
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
    if (!input.devWorkspace.gradleReady) {
      extra.push({
        level: 'WARNING',
        category: 'Dev Workspace',
        message: 'Gradle project files are not set up yet.',
        fix: 'Open Dev Workspace and run Set Up Workspace.',
        aiFixable: false
      })
    }
    if (!input.devWorkspace.sourceReady) {
      extra.push({
        level: 'SUGGESTION',
        category: 'Dev Workspace',
        message: 'Source scaffold is missing.',
        fix: 'Generate source folders from Dev Workspace before running local builds.',
        aiFixable: false
      })
    }
    if (input.devWorkspace.artifacts.length === 0) {
      extra.push({
        level: 'SUGGESTION',
        category: 'Release readiness',
        message: 'No local artifacts have been built yet.',
        fix: 'Run Build All or Package Local Release before publishing.',
        aiFixable: false
      })
    }
    const hasReleaseManifest = input.devWorkspace.artifacts.some((artifact) => artifact.name === 'echo-release.json')
    const hasChecksums = input.devWorkspace.artifacts.some((artifact) => artifact.name === 'checksums.sha256')
    if (input.devWorkspace.artifacts.length > 0 && (!hasReleaseManifest || !hasChecksums)) {
      extra.push({
        level: 'WARNING',
        category: 'Release readiness',
        message: 'Built artifacts are missing echo-release.json or checksums.sha256.',
        fix: 'Use Release Builder to prepare the local release package.',
        aiFixable: false
      })
    }
  }

  return mergeReport(base, extra)
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
function markerExists(layers: HoloMapLayer[], id: string): boolean {
  return layers.some((l) => l.markers.some((m) => m.id === id))
}

function detectRecipeCycle(recipes: Recipe[]): string | null {
  // Edge: recipe output item -> recipes that consume it.
  const byInput = new Map<string, Recipe[]>()
  for (const r of recipes) {
    for (const inp of r.inputs) {
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
    for (const next of byInput.get(r.output.item) ?? []) visit(next)
    visiting.delete(r.id)
    done.add(r.id)
  }
  for (const r of recipes) visit(r)
  return found
}

function mergeReport(base: PackOSReport, extra: ValidationIssue[]): PackOSReport {
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
      publishing: publishingReady ? 'Ready' : 'Not Ready'
    }
  }
}
