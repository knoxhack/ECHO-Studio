import { promises as fs } from 'fs'
import { readManifest, listProjects } from './fsService'
import { listContent } from './contentService'
import type { AddonProject, Runtime } from '../shared/types'
import { computeSandboxScore, type SandboxResult, type SandboxOptions, type SandboxLog } from '../shared/sandbox'
import { findEchoModule, normalizeModuleId } from '../shared/moduleCatalog'
import { listEchoModules } from './moduleCatalogService'

const PROFILES: Record<string, { runtime: Runtime; experiences: string[]; permissions: string[] }> = {
  'Ashfall Sandbox': {
    runtime: 'neoforge',
    experiences: ['ashfall'],
    permissions: ['mission.register', 'recipe.register', 'holomap.layers', 'screen.custom', 'index.append']
  },
  'ECHO Prime Sandbox': {
    runtime: 'echo_native',
    experiences: ['echo_prime'],
    permissions: ['mission.register', 'recipe.register', 'screen.custom', 'index.append', 'theme.apply']
  },
  'Arcana Sandbox': {
    runtime: 'neoforge',
    experiences: ['arcana_division'],
    permissions: ['mission.register', 'recipe.register', 'holomap.layers', 'screen.custom', 'index.append']
  },
  'Generic ECHO Runtime Sandbox': {
    runtime: 'standalone',
    experiences: ['generic', 'custom'],
    permissions: ['mission.register', 'recipe.register', 'screen.custom', 'index.append']
  },
  'Server Sandbox': {
    runtime: 'neoforge',
    experiences: ['generic'],
    permissions: ['mission.register', 'recipe.register', 'index.append']
  }
}

async function listWorkspaceProjects(workspaceDir: string): Promise<AddonProject[]> {
  try {
    return listProjects(workspaceDir)
  } catch {
    return []
  }
}

function logOptions(options: SandboxOptions, log: (level: SandboxLog['level'], message: string) => void): void {
  if (options.debugOverlay) log('info', 'Debug overlay enabled.')
  if (options.fakePlayer) log('ok', 'Fake player profile enabled.')
  if (options.testInventory) log('ok', 'Test inventory enabled.')
  if (options.loadOnlySelected) log('info', 'Loading only the selected project; workspace dependency scan is disabled.')
}

export async function runSandbox(
  projectPath: string,
  workspaceDir: string,
  profile: string,
  options: SandboxOptions
): Promise<SandboxResult> {
  const logs: SandboxLog[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const missingDependencies: string[] = []
  let contentLoaded = 0
  let contentFailed = 0

  const now = () => new Date().toISOString().split('T')[1].slice(0, 8)
  const log = (level: SandboxLog['level'], message: string) => logs.push({ time: now(), level, message })

  log('info', `Initializing sandbox runtime... (${profile})`)
  logOptions(options, log)

  const manifest = await readManifest(projectPath)
  if (!manifest) {
    errors.push('Missing or unreadable echo.mod.json')
    log('error', 'Failed to read addon manifest.')
    return { profile, logs, compatibilityScore: 0, missingDependencies, warnings, errors, contentLoaded, contentFailed }
  }

  log('ok', `Loading addon: ${manifest.id} v${manifest.version}`)

  const profileDef = PROFILES[profile] || PROFILES['Generic ECHO Runtime Sandbox']

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
    warnings.push(`Addon targets ${manifest.target.experiences.join(', ')}, but sandbox profile expects ${profileDef.experiences.join(', ')}.`)
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

  const score = computeSandboxScore(missingDependencies.length, warnings.length, errors.length, contentFailed)

  log('ok', `Sandbox ready. Compatibility score: ${score}%`)

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

export { computeSandboxScore } from '../shared/sandbox'
