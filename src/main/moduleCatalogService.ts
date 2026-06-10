import { promises as fs } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import {
  ECHO_MODULE_CATALOG,
  mergeModuleCatalog,
  moduleFromIndexEntry,
  type EchoModuleCatalogResult,
  type EchoModulesIndex
} from '../shared/moduleCatalog'
import { DEFAULT_CONFIG } from '../shared/config'
import { getConfig } from './config'

interface ModuleIndexCandidate {
  root: string
  indexPath: string
  configured?: boolean
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function parentCandidates(start: string | undefined): string[] {
  if (!start) return []
  const out: string[] = []
  let current = resolve(start)
  for (let i = 0; i < 6; i++) {
    out.push(join(current, 'ECHO-Modules'))
    out.push(join(dirname(current), 'ECHO-Modules'))
    current = dirname(current)
  }
  return out
}

function autodetectedModuleRootCandidates(projectPath?: string): string[] {
  return unique([
    process.env['ECHO_MODULES_DIR'] ?? '',
    ...parentCandidates(projectPath),
    ...parentCandidates(process.cwd()),
    'C:\\Development\\Github\\ECHO-Modules'
  ])
}

function resolveModulePath(root: string, value: string | undefined): string | undefined {
  return value ? resolve(root, value) : undefined
}

function moduleIndexPath(root: string): string {
  return join(root, 'metadata', 'modules', 'index.json')
}

function inferRootFromIndexPath(indexPath: string): string {
  const resolved = resolve(indexPath)
  const modulesDir = dirname(resolved)
  const metadataDir = dirname(modulesDir)
  if (basename(modulesDir) === 'modules' && basename(metadataDir) === 'metadata') {
    return dirname(metadataDir)
  }
  return dirname(resolved)
}

async function configuredModuleCandidates(): Promise<ModuleIndexCandidate[]> {
  const config = await getConfig().catch(() => DEFAULT_CONFIG)
  const moduleRoot = config.moduleCatalog.moduleRoot.trim()
  const indexPath = config.moduleCatalog.indexPath.trim()
  const candidates: ModuleIndexCandidate[] = []
  if (indexPath) {
    candidates.push({
      root: moduleRoot ? resolve(moduleRoot) : inferRootFromIndexPath(indexPath),
      indexPath: resolve(indexPath),
      configured: true
    })
  }
  if (moduleRoot) {
    const root = resolve(moduleRoot)
    candidates.push({ root, indexPath: moduleIndexPath(root), configured: true })
  }
  return candidates
}

async function moduleIndexCandidates(projectPath?: string): Promise<ModuleIndexCandidate[]> {
  const configured = await configuredModuleCandidates()
  const autodetected = autodetectedModuleRootCandidates(projectPath).map((root) => ({
    root: resolve(root),
    indexPath: moduleIndexPath(root)
  }))
  const seen = new Set<string>()
  return [...configured, ...autodetected].filter((candidate) => {
    const key = resolve(candidate.indexPath).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function findModuleIndex(projectPath?: string): Promise<{ found: ModuleIndexCandidate | null; warnings: string[] }> {
  const candidates = await moduleIndexCandidates(projectPath)
  const missingConfigured: string[] = []
  for (const candidate of candidates) {
    if (await exists(candidate.indexPath)) {
      const warnings = missingConfigured.length > 0
        ? [`Configured ECHO-Modules index was not found: ${missingConfigured.join(', ')}. Using ${candidate.indexPath}.`]
        : []
      return { found: candidate, warnings }
    }
    if (candidate.configured) missingConfigured.push(candidate.indexPath)
  }
  return {
    found: null,
    warnings: missingConfigured.length > 0
      ? [`Configured ECHO-Modules index was not found: ${missingConfigured.join(', ')}.`]
      : []
  }
}

export async function listEchoModules(projectPath?: string): Promise<EchoModuleCatalogResult> {
  const discovery = await findModuleIndex(projectPath)
  const found = discovery.found
  if (!found) {
    return {
      catalog: mergeModuleCatalog([]),
      source: 'builtin',
      warnings: [
        ...discovery.warnings,
        'Local ECHO-Modules metadata/modules/index.json was not found. Using built-in starter catalog.'
      ]
    }
  }

  try {
    const raw = JSON.parse(await fs.readFile(found.indexPath, 'utf8')) as EchoModulesIndex
    const imported = (raw.modules ?? []).map((entry) => {
      const record = moduleFromIndexEntry(entry, {
        catalogPath: found.indexPath,
        moduleRoot: found.root
      })
      return {
        ...record,
        moduleDir: resolveModulePath(found.root, entry.moduleDir),
        descriptorPath: resolveModulePath(found.root, entry.descriptorPath)
      }
    })
    return {
      catalog: mergeModuleCatalog(imported, ECHO_MODULE_CATALOG),
      source: 'local-index',
      indexPath: found.indexPath,
      moduleRoot: found.root,
      generatedAt: raw.generatedAt,
      warnings: [
        ...discovery.warnings,
        ...(raw.modules?.length ? [] : ['Local module index was readable but did not contain modules.'])
      ]
    }
  } catch (error) {
    return {
      catalog: mergeModuleCatalog([]),
      source: 'builtin',
      indexPath: found.indexPath,
      moduleRoot: found.root,
      warnings: [
        ...discovery.warnings,
        `Failed to read local module index: ${error instanceof Error ? error.message : String(error)}`
      ]
    }
  }
}
