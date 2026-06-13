import { promises as fs } from 'fs'
import { readManifest, listProjects } from './fsService'
import { listContent } from './contentService'
import type { AddonProject } from '../shared/types'
import { computePreviewScore, getPreviewScanProfile, normalizePreviewScanProfile, type PreviewScanResult, type PreviewScanOptions, type PreviewScanLog } from '../shared/previewScan'
import {
  findEchoModule,
  normalizeModuleId,
  preferredModuleAlias,
  resolveProjectModulePlan,
  type EchoModuleRecord
} from '../shared/moduleCatalog'
import { listEchoModules } from './moduleCatalogService'

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
  if (options.loadOnlySelected) log('info', 'Loading only the active project; workspace dependency scan is disabled.')
}

function uniqueDependencies(ids: string[], catalog: EchoModuleRecord[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const normalized = normalizeModuleId(id, catalog)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(id)
  }
  return out
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
  log('info', 'Evidence level: static compatibility checks. Launch a runtime target for live runtime logs.')
  logOptions(options, log)

  const manifest = await readManifest(projectPath)
  if (!manifest) {
    errors.push('Missing or unreadable echo.mod.json')
    log('error', 'Failed to read project manifest.')
    return {
      profile,
      evidenceLevel: 'static_compatibility',
      runtimeExecuted: false,
      logs,
      compatibilityScore: 0,
      missingDependencies,
      warnings,
      errors,
      contentLoaded,
      contentFailed
    }
  }

  log('ok', `Loading project: ${manifest.id} v${manifest.version}`)

  const normalizedProfile = normalizePreviewScanProfile(profile)
  const profileDef = getPreviewScanProfile(normalizedProfile)

  // Runtime check
  if (!manifest.runtime.supports.includes(profileDef.runtime)) {
    warnings.push(`Project does not declare support for runtime "${profileDef.runtime}".`)
    log('warn', `Runtime mismatch: profile wants ${profileDef.runtime}, project supports ${manifest.runtime.supports.join(', ')}`)
  } else {
    log('ok', `Runtime compatible: ${profileDef.runtime}`)
  }

  // Experience target check
  const hasTarget = manifest.target.experiences.some((e) => profileDef.experiences.includes(e))
  if (!hasTarget) {
    warnings.push(`Project targets ${manifest.target.experiences.join(', ')}, but compatibility profile expects ${profileDef.experiences.join(', ')}.`)
    log('warn', 'Experience target mismatch detected.')
  } else {
    log('ok', 'Experience target compatible.')
  }

  // Dependency resolution
  const workspaceProjects = options.loadOnlySelected ? [] : await listWorkspaceProjects(workspaceDir)
  const moduleCatalog = await listEchoModules(projectPath)
  const workspaceIds = new Set(workspaceProjects.map((p) => normalizeModuleId(p.manifest.id, moduleCatalog.catalog)))
  const modulePlan = resolveProjectModulePlan(manifest, moduleCatalog.catalog)
  const requiredIds = new Set(manifest.dependencies.required.map((dep) => normalizeModuleId(dep, moduleCatalog.catalog)))
  const missingRequiredEntries = modulePlan.closure.filter((mod) => !requiredIds.has(mod.id))
  if (missingRequiredEntries.length > 0) {
    const missing = missingRequiredEntries.map((mod) => preferredModuleAlias(mod))
    warnings.push(`Manifest dependencies.required is missing resolved module entries: ${missing.join(', ')}.`)
    log('warn', `Manifest required module closure is incomplete: ${missing.join(', ')}`)
  }
  const required = uniqueDependencies([
    ...manifest.dependencies.required,
    ...modulePlan.closure.map((mod) => preferredModuleAlias(mod))
  ], moduleCatalog.catalog)
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
    evidenceLevel: 'static_compatibility',
    runtimeExecuted: false,
    logs,
    compatibilityScore: score,
    missingDependencies,
    warnings,
    errors,
    contentLoaded,
    contentFailed
  }
}

export { computePreviewScore } from '../shared/previewScan'
