import { promises as fs } from 'fs'
import { readManifest, listProjects } from './fsService'
import { listContent } from './contentService'
import type { AddonProject, Runtime } from '../shared/types'
import { computePreviewScore, type PreviewScanResult, type PreviewScanOptions, type PreviewScanLog } from '../shared/previewScan'
import { findEchoModule, normalizeModuleId } from '../shared/moduleCatalog'
import { listEchoModules } from './moduleCatalogService'

const PROFILES: Record<string, { runtime: Runtime; experiences: string[]; permissions: string[] }> = {
  'Ashfall Compatibility': {
    runtime: 'neoforge',
    experiences: ['ashfall'],
    permissions: ['mission.register', 'recipe.register', 'holomap.layers', 'screen.custom_ui', 'index.entries']
  },
  'ECHO Prime Compatibility': {
    runtime: 'echo_native',
    experiences: ['echo_prime'],
    permissions: ['mission.register', 'recipe.register', 'screen.custom_ui', 'index.entries']
  },
  'Arcana Compatibility': {
    runtime: 'neoforge',
    experiences: ['arcana_division'],
    permissions: ['mission.register', 'recipe.register', 'holomap.layers', 'screen.custom_ui', 'index.entries']
  },
  'Generic Runtime Compatibility': {
    runtime: 'standalone',
    experiences: ['generic', 'custom'],
    permissions: ['mission.register', 'recipe.register', 'screen.custom_ui', 'index.entries']
  },
  'Server Compatibility': {
    runtime: 'neoforge',
    experiences: ['generic'],
    permissions: ['mission.register', 'recipe.register', 'index.entries']
  }
}

const LEGACY_PROFILE_NAMES: Record<string, string> = {
  'Ashfall Sandbox': 'Ashfall Compatibility',
  'ECHO Prime Sandbox': 'ECHO Prime Compatibility',
  'Arcana Sandbox': 'Arcana Compatibility',
  'Generic ECHO Runtime Sandbox': 'Generic Runtime Compatibility',
  'Server Sandbox': 'Server Compatibility'
}

function normalizeProfile(profile: string): string {
  return LEGACY_PROFILE_NAMES[profile] ?? profile
}

async function listWorkspaceProjects(workspaceDir: string): Promise<AddonProject[]> {
  try {
    return listProjects(workspaceDir)
  } catch {
    return []
  }
}

function logOptions(options: PreviewScanOptions, log: (level: PreviewScanLog['level'], message: string) => void): void {
  if (options.debugOverlay) log('info', 'Debug overlay enabled.')
  if (options.fakePlayer) log('ok', 'Fake player profile enabled.')
  if (options.testInventory) log('ok', 'Test inventory enabled.')
  if (options.loadOnlySelected) log('info', 'Loading only the selected project; workspace dependency scan is disabled.')
}

export async function runPreviewScan(
  projectPath: string,
  workspaceDir: string,
  profile: string,
  options: PreviewScanOptions
): Promise<PreviewScanResult> {
  const logs: PreviewScanLog[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const missingDependencies: string[] = []
  let contentLoaded = 0
  let contentFailed = 0

  const now = () => new Date().toISOString().split('T')[1].slice(0, 8)
  const log = (level: PreviewScanLog['level'], message: string) => logs.push({ time: now(), level, message })

  log('info', `Initializing compatibility scan... (${profile})`)
  logOptions(options, log)

  const manifest = await readManifest(projectPath)
  if (!manifest) {
    errors.push('Missing or unreadable echo.mod.json')
    log('error', 'Failed to read addon manifest.')
    return { profile, logs, compatibilityScore: 0, missingDependencies, warnings, errors, contentLoaded, contentFailed }
  }

  log('ok', `Loading addon: ${manifest.id} v${manifest.version}`)

  const normalizedProfile = normalizeProfile(profile)
  const profileDef = PROFILES[normalizedProfile] || PROFILES['Generic Runtime Compatibility']

  // Runtime check
  if (!manifest.runtime.supports.includes(profileDef.runtime)) {
    warnings.push(`Addon does not declare support for runtime "${profileDef.runtime}".`)
    log('warn', `Runtime mismatch: profile wants ${profileDef.runtime}, addon supports ${manifest.runtime.supports.join(', ')}`)
  } else {
    log('ok', `Runtime compatible: ${profileDef.runtime}`)
  }

  // Experience target check
  const hasTarget = manifest.target.experiences.some((e) => profileDef.experiences.includes(e))
  if (!hasTarget) {
    warnings.push(`Addon targets ${manifest.target.experiences.join(', ')}, but compatibility profile expects ${profileDef.experiences.join(', ')}.`)
    log('warn', 'Experience target mismatch detected.')
  } else {
    log('ok', 'Experience target compatible.')
  }

  // Dependency resolution
  const workspaceProjects = options.loadOnlySelected ? [] : await listWorkspaceProjects(workspaceDir)
  const moduleCatalog = await listEchoModules(projectPath)
  const workspaceIds = new Set(workspaceProjects.map((p) => normalizeModuleId(p.manifest.id, moduleCatalog.catalog)))
  const required = manifest.dependencies.required
  log('info', `Resolving dependencies: ${required.join(', ') || 'none'}`)
  if (!options.loadOnlySelected && workspaceProjects.length > 0) {
    log('info', `Workspace dependency candidates: ${workspaceProjects.length}`)
  }
  for (const dep of required) {
    const module = findEchoModule(dep, moduleCatalog.catalog)
    if (module) {
      log('ok', `  Resolved ${dep} from ECHO Modules catalog (${module.name})`)
    } else if (workspaceIds.has(normalizeModuleId(dep, moduleCatalog.catalog))) {
      log('ok', `  Resolved ${dep} from workspace`)
    } else {
      missingDependencies.push(dep)
      log('warn', `  Missing dependency: ${dep}`)
    }
  }

  // Permission check
  const unknownPerms = manifest.permissions.filter((p) => !profileDef.permissions.includes(p))
  if (unknownPerms.length > 0) {
    warnings.push(`Unknown permissions for this profile: ${unknownPerms.join(', ')}`)
    log('warn', `Unknown permissions: ${unknownPerms.join(', ')}`)
  }

  // Content load simulation
  const types = ['mission', 'recipe', 'screen', 'holomap', 'index'] as const
  for (const type of types) {
    try {
      const items = await listContent(projectPath, type)
      for (const item of items) {
        try {
          const raw = await fs.readFile(item.path, 'utf-8')
          JSON.parse(raw)
          contentLoaded++
        } catch {
          contentFailed++
          warnings.push(`Invalid JSON in ${type}: ${item.id}`)
        }
      }
      if (items.length > 0) log('ok', `${type} registered ${items.length} items`)
    } catch {
      // Content type folder may not exist.
    }
  }

  if (contentFailed > 0) {
    log('error', `${contentFailed} content file(s) failed to load.`)
  }

  const score = computePreviewScore(missingDependencies.length, warnings.length, errors.length, contentFailed)

  log('ok', `Compatibility scan complete. Score: ${score}%`)

  return {
    profile,
    logs,
    compatibilityScore: score,
    missingDependencies,
    warnings,
    errors,
    contentLoaded,
    contentFailed
  }
}

export const runSandbox = runPreviewScan
export { computePreviewScore, computeSandboxScore } from '../shared/previewScan'
