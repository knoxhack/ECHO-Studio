import { promises as fs } from 'fs'
import { readManifest, listProjects } from './fsService'
import { listContent } from './contentService'
import type { AddonProject } from '../shared/types'
import type { SandboxResult, SandboxOptions, SandboxLog } from '../shared/sandbox'

const PROFILES: Record<string, { runtime: string; experiences: string[]; permissions: string[] }> = {
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

export async function runSandbox(
  projectPath: string,
  workspaceDir: string,
  profile: string,
  _options: SandboxOptions
): Promise<SandboxResult> {
  const logs: SandboxLog[] = []
  const warnings: string[] = []
  const errors: string[] = []
  const missingDependencies: string[] = []
  let contentLoaded = 0
  let contentFailed = 0

  const now = () => new Date().toISOString().split('T')[1].slice(0, 8)
  const log = (level: SandboxLog['level'], message: string) => logs.push({ time: now(), level, message })

  log('info', `Initialising sandbox runtime… (${profile})`)

  const manifest = await readManifest(projectPath)
  if (!manifest) {
    errors.push('Missing or unreadable echo.mod.json')
    log('error', 'Failed to read addon manifest.')
    return { profile, logs, compatibilityScore: 0, missingDependencies, warnings, errors, contentLoaded, contentFailed }
  }

  log('ok', `Loading addon: ${manifest.namespace}:${manifest.id} v${manifest.version}`)

  const profileDef = PROFILES[profile] || PROFILES['Generic ECHO Runtime Sandbox']

  // Runtime check
  if (!manifest.runtime.supports.includes(profileDef.runtime as any) && profileDef.runtime !== 'standalone') {
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
  const workspaceProjects = await listWorkspaceProjects(workspaceDir)
  const workspaceIds = new Set(workspaceProjects.map((p) => p.manifest.id))
  const required = manifest.dependencies.required
  log('info', `Resolving dependencies: ${required.join(', ') || 'none'}`)
  for (const dep of required) {
    if (workspaceIds.has(dep)) {
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
          JSON.parse(raw) // validate JSON
          contentLoaded++
        } catch {
          contentFailed++
          warnings.push(`Invalid JSON in ${type}: ${item.id}`)
        }
      }
      if (items.length > 0) log('ok', `${type} registered ${items.length} items`)
    } catch {
      // content type folder may not exist
    }
  }

  if (contentFailed > 0) {
    log('error', `${contentFailed} content file(s) failed to load.`)
  }

  // Score calculation
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

export function computeSandboxScore(
  missingDeps: number,
  warningCount: number,
  errorCount: number,
  contentFailed: number
): number {
  let score = 100
  score -= missingDeps * 10
  score -= warningCount * 3
  score -= errorCount * 15
  score -= contentFailed * 5
  return Math.max(0, Math.min(100, score))
}
