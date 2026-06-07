import {
  ALLOWED_PERMISSIONS,
  BLOCKED_PERMISSIONS,
  RESERVED_NAMESPACE
} from './constants'
import type {
  AddonManifest,
  IssueLevel,
  PackOSReport,
  ValidationIssue
} from './types'

// PackOS Check — the core safety gate. Pure function over a manifest so it can
// run in either process and be unit-tested easily.
export function runPackOSCheck(manifest: AddonManifest): PackOSReport {
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
      message: `Addon ID "${manifest.id}" is not a valid namespaced ID.`,
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
      fix: 'Add a clear description of what your addon does.',
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
        fix: 'Remove it or use a documented public SDK permission.'
      })
    }
  }

  // --- Dependencies ----------------------------------------------------------
  const required = manifest.dependencies.required
  if (!required.includes('echo:core')) {
    issues.push({
      level: 'ERROR',
      category: 'Dependencies',
      message: 'Missing required dependency: echo:core.',
      fix: 'Add echo:core to required dependencies.',
      aiFixable: true
    })
  }
  if (manifest.permissions.includes('mission.register') && !required.includes('echo:mission_core')) {
    issues.push({
      level: 'ERROR',
      category: 'Dependencies',
      message: 'Addon registers missions but does not require MissionCore.',
      fix: 'Add dependency echo:mission_core.',
      aiFixable: true
    })
  }
  if (manifest.permissions.includes('recipe.register') && !required.includes('echo:recipe_core')) {
    issues.push({
      level: 'WARNING',
      category: 'Dependencies',
      message: 'Addon registers recipes but does not require RecipeCore.',
      fix: 'Add dependency echo:recipe_core.',
      aiFixable: true
    })
  }

  // --- Runtime / native readiness -------------------------------------------
  if (manifest.runtime.supports.includes('echo_native') && manifest.runtime.nativeReadiness === 'none') {
    issues.push({
      level: 'WARNING',
      category: 'Runtime compatibility',
      message: 'Addon declares ECHO Native support but native readiness is "none".',
      fix: 'Use the public ECHO SDK lifecycle entrypoints, or lower native support.'
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

function buildReport(manifest: AddonManifest, issues: ValidationIssue[]): PackOSReport {
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
export function autoFixManifest(manifest: AddonManifest): AddonManifest {
  const fixed: AddonManifest = JSON.parse(JSON.stringify(manifest))
  const safeNs = fixed.publisher.id || 'teamnova'

  if (fixed.namespace === RESERVED_NAMESPACE) fixed.namespace = safeNs
  if (fixed.id.startsWith(`${RESERVED_NAMESPACE}:`)) {
    fixed.id = `${safeNs}:${fixed.id.split(':')[1] ?? 'addon'}`
  }

  // Swap blocked permissions for safe equivalents.
  fixed.permissions = Array.from(
    new Set(fixed.permissions.map((p) => (p in BLOCKED_PERMISSIONS ? BLOCKED_PERMISSIONS[p] : p)))
  )

  // Add missing required deps.
  if (!fixed.dependencies.required.includes('echo:core')) {
    fixed.dependencies.required.unshift('echo:core')
  }
  if (
    fixed.permissions.includes('mission.register') &&
    !fixed.dependencies.required.includes('echo:mission_core')
  ) {
    fixed.dependencies.required.push('echo:mission_core')
  }
  if (
    fixed.permissions.includes('recipe.register') &&
    !fixed.dependencies.required.includes('echo:recipe_core')
  ) {
    fixed.dependencies.required.push('echo:recipe_core')
  }

  if (fixed.runtime.supports.length === 0) fixed.runtime.supports = ['neoforge']
  if (!fixed.tags || fixed.tags.length === 0) fixed.tags = ['echo', 'addon']

  return fixed
}
