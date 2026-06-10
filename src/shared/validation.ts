import {
  ALLOWED_PERMISSIONS,
  BLOCKED_PERMISSIONS,
  RESERVED_NAMESPACE
} from './constants'
import {
  addRequiredModuleClosureToManifest,
  dependencyIncludes,
  findEchoModule,
  resolveProjectModulePlan,
  type EchoModuleRecord
} from './moduleCatalog'
import type {
  AddonManifest,
  IssueLevel,
  ValidationReport,
  ValidationIssue
} from './types'

// Validation - the core safety gate. Pure function over a manifest so it can
// run in either process and be unit-tested easily.
export function runValidationCheck(manifest: AddonManifest, moduleCatalog?: EchoModuleRecord[]): ValidationReport {
  const issues: ValidationIssue[] = []

  // --- Namespace / identity --------------------------------------------------
  if (manifest.namespace === RESERVED_NAMESPACE || manifest.id.startsWith(`${RESERVED_NAMESPACE}:`)) {
    issues.push({
      level: 'BLOCKER',
      category: 'Manifest',
      message: `Addon uses reserved namespace: ${RESERVED_NAMESPACE}`,
      fix: `Change namespace to your creator namespace, e.g. ${manifest.publisher.id || 'teamnova'}.`,
      file: 'echo.mod.json',
      aiFixable: true
    })
  }
  if (!/^[a-z0-9_]+:[a-z0-9_]+$/.test(manifest.id)) {
    issues.push({
      level: 'ERROR',
      category: 'Manifest',
      message: `Project ID "${manifest.id}" is not a valid namespaced ID.`,
      fix: 'Use the format namespace:addon_id (lowercase, underscores).',
      file: 'echo.mod.json',
      aiFixable: true
    })
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    issues.push({
      level: 'WARNING',
      category: 'Manifest',
      message: 'Version should follow semantic versioning (e.g. 0.3.0).',
      file: 'echo.mod.json'
    })
  }
  if (!manifest.description || manifest.description.trim().length < 10) {
    issues.push({
      level: 'WARNING',
      category: 'Publishing requirements',
      message: 'Description is missing or too short for the community catalog.',
      fix: 'Add a clear description of what your project does.',
      aiFixable: true
    })
  }

  // --- Permissions -----------------------------------------------------------
  for (const perm of manifest.permissions) {
    if (perm in BLOCKED_PERMISSIONS) {
      issues.push({
        level: 'BLOCKER',
        category: 'Permissions',
        message: `Restricted permission: ${perm} is not allowed for community addons.`,
        fix: `Use ${BLOCKED_PERMISSIONS[perm]} instead.`,
        file: 'echo.mod.json',
        aiFixable: true
      })
    } else if (!(ALLOWED_PERMISSIONS as readonly string[]).includes(perm)) {
      issues.push({
        level: 'WARNING',
        category: 'Permissions',
        message: `Unknown permission: ${perm}.`,
        fix: 'Remove it or use a documented public ECHO permission.'
      })
    }
  }

  // --- Dependencies ----------------------------------------------------------
  const required = manifest.dependencies.required
  if (!dependencyIncludes(required, 'echocore', moduleCatalog)) {
    issues.push({
      level: 'ERROR',
      category: 'Dependencies',
      message: 'Missing required dependency: echo:core / echocore.',
      fix: 'Add echocore or echo:core to required dependencies.',
      aiFixable: true
    })
  }
  if (manifest.permissions.includes('mission.register') && !dependencyIncludes(required, 'echomissioncore', moduleCatalog)) {
    issues.push({
      level: 'ERROR',
      category: 'Dependencies',
      message: 'Addon registers missions but does not require MissionCore.',
      fix: 'Add dependency echomissioncore or echo:mission_core.',
      aiFixable: true
    })
  }
  if (manifest.permissions.includes('recipe.register') && !dependencyIncludes(required, 'echorecipecore', moduleCatalog)) {
    issues.push({
      level: 'WARNING',
      category: 'Dependencies',
      message: 'Addon registers recipes but does not require RecipeCore.',
      fix: 'Add dependency echorecipecore or echo:recipe_core.',
      aiFixable: true
    })
  }

  const modulePlan = resolveProjectModulePlan(manifest, moduleCatalog)
  for (const dep of modulePlan.unknown) {
    issues.push({
      level: 'WARNING',
      category: 'ECHO Modules',
      message: `Unknown module dependency: ${dep}.`,
      fix: 'Use a module from the ECHO Modules catalog or keep it namespaced as a third-party dependency.'
    })
  }
  for (const dep of modulePlan.missingRequired) {
    issues.push({
      level: 'WARNING',
      category: 'ECHO Modules',
      message: `${dep.name} requires ${dep.requires.join(', ')}; dependency closure is incomplete.`,
      fix: `Add ${dep.id} or let Studio add the full required module closure.`,
      aiFixable: true
    })
  }
  const riskyClosure = Array.from(new Map(modulePlan.closure.map((mod) => [mod.id, mod])).values())
  for (const mod of riskyClosure) {
    if (mod.blocked || mod.trustLevel === 'blocked') {
      issues.push({
        level: 'BLOCKER',
        category: 'ECHO Modules',
        message: `${mod.name} is blocked and cannot be used for public releases.`,
        fix: mod.blockReason || 'Remove the blocked module or choose a supported replacement.'
      })
    } else if (mod.status === 'deprecated') {
      issues.push({
        level: 'ERROR',
        category: 'ECHO Modules',
        message: `${mod.name} is deprecated and should not be used for new releases.`,
        fix: 'Remove the deprecated module or replace it with its supported successor.'
      })
    } else if (mod.status === 'internal') {
      issues.push({
        level: 'WARNING',
        category: 'ECHO Modules',
        message: `${mod.name} is marked internal and may not be accepted for public release.`,
        fix: 'Use public stable/beta modules for catalog-ready projects.'
      })
    } else if (mod.trustLevel === 'sandboxed') {
      issues.push({
        level: 'WARNING',
        category: 'ECHO Modules',
        message: `${mod.name} is sandboxed and may require additional review before publishing.`,
        fix: 'Keep sandboxed modules for local/dev use or confirm release eligibility before public release.'
      })
    }
  }

  // --- Runtime / native readiness -------------------------------------------
  if (manifest.runtime.supports.includes('echo_native') && manifest.runtime.nativeReadiness === 'none') {
    issues.push({
      level: 'WARNING',
      category: 'Runtime compatibility',
      message: 'Addon declares ECHO Native support but native readiness is "none".',
      fix: 'Use the public ECHO lifecycle entrypoints, or lower native support.'
    })
  }
  if (manifest.runtime.supports.length === 0) {
    issues.push({
      level: 'ERROR',
      category: 'Runtime compatibility',
      message: 'No runtime declared.',
      fix: 'Declare at least one runtime (NeoForge or ECHO Native).',
      aiFixable: true
    })
  }

  // --- Publishing ------------------------------------------------------------
  if (!manifest.support?.issues) {
    issues.push({
      level: 'SUGGESTION',
      category: 'Publishing requirements',
      message: 'No support/issues link provided.',
      fix: 'Add a support link so users can report problems.'
    })
  }
  if (!manifest.tags || manifest.tags.length === 0) {
    issues.push({
      level: 'SUGGESTION',
      category: 'Publishing requirements',
      message: 'No tags set. Tags improve catalog discoverability.',
      aiFixable: true
    })
  }

  return buildReport(manifest, issues)
}

/** @deprecated Use runValidationCheck. Kept for older callers and saved workflows. */
export const runPackOSCheck = runValidationCheck

function buildReport(manifest: AddonManifest, issues: ValidationIssue[]): ValidationReport {
  const counts: Record<IssueLevel, number> = {
    BLOCKER: 0,
    ERROR: 0,
    WARNING: 0,
    INFO: 0,
    SUGGESTION: 0
  }
  for (const i of issues) counts[i.level]++

  // Score: start at 100, subtract weighted penalties.
  let score = 100
  score -= counts.BLOCKER * 25
  score -= counts.ERROR * 8
  score -= counts.WARNING * 3
  score -= counts.SUGGESTION * 1
  score = Math.max(0, Math.min(100, score))

  const publishingReady = counts.BLOCKER === 0 && counts.ERROR === 0

  const nativeReadiness =
    manifest.runtime.nativeReadiness === 'full'
      ? 100
      : manifest.runtime.nativeReadiness === 'partial'
        ? 70
        : 30

  const permsBlocked = manifest.permissions.some((p) => p in BLOCKED_PERMISSIONS)
  const permsUnknown = manifest.permissions.some(
    (p) => !(ALLOWED_PERMISSIONS as readonly string[]).includes(p) && !(p in BLOCKED_PERMISSIONS)
  )

  return {
    compatibilityScore: score,
    publishingReady,
    counts,
    issues,
    healthScore: {
      compatibility: score,
      nativeReadiness,
      assets: 100,
      permissions: permsBlocked ? 'Blocked' : permsUnknown ? 'Risky' : 'Safe',
      publishing: publishingReady ? 'Ready' : 'Not Ready'
    }
  }
}

// Apply automatic fixes a (mock) AI would make. Returns a new manifest.
export function autoFixManifest(manifest: AddonManifest, moduleCatalog?: EchoModuleRecord[]): AddonManifest {
  let fixed: AddonManifest = JSON.parse(JSON.stringify(manifest))
  const safeNs = fixed.publisher.id || 'teamnova'

  if (fixed.namespace === RESERVED_NAMESPACE) fixed.namespace = safeNs
  if (fixed.id.startsWith(`${RESERVED_NAMESPACE}:`)) {
    fixed.id = `${safeNs}:${fixed.id.split(':')[1] ?? 'addon'}`
  }

  // Swap blocked permissions for safe equivalents.
  fixed.permissions = Array.from(
    new Set(fixed.permissions.map((p) => (p in BLOCKED_PERMISSIONS ? BLOCKED_PERMISSIONS[p] : p)))
  )

  // Add missing required deps with their full current ECHO Modules closure.
  const modulesToRequire: EchoModuleRecord[] = []
  const addModule = (id: string): void => {
    const mod = findEchoModule(id, moduleCatalog)
    if (mod && !modulesToRequire.some((item) => item.id === mod.id)) modulesToRequire.push(mod)
  }

  if (!dependencyIncludes(fixed.dependencies.required, 'echocore', moduleCatalog)) addModule('echocore')
  if (
    fixed.permissions.includes('mission.register') &&
    !dependencyIncludes(fixed.dependencies.required, 'echomissioncore', moduleCatalog)
  ) {
    addModule('echomissioncore')
  }
  if (
    fixed.permissions.includes('recipe.register') &&
    !dependencyIncludes(fixed.dependencies.required, 'echorecipecore', moduleCatalog)
  ) {
    addModule('echorecipecore')
  }
  for (const mod of resolveProjectModulePlan(fixed, moduleCatalog).missingRequired) addModule(mod.id)
  if (modulesToRequire.length > 0) {
    fixed = addRequiredModuleClosureToManifest(fixed, modulesToRequire, moduleCatalog)
  }

  if (fixed.runtime.supports.length === 0) fixed.runtime.supports = ['neoforge']
  if (!fixed.tags || fixed.tags.length === 0) fixed.tags = ['echo', 'addon']

  return fixed
}
