import { promises as fs } from 'fs'
import { dirname, join, resolve } from 'path'
import {
  ECHO_MODULE_CATALOG,
  mergeModuleCatalog,
  moduleFromIndexEntry,
  type EchoModuleCatalogResult,
  type EchoModulesIndex
} from '../shared/moduleCatalog'

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

function moduleRootCandidates(projectPath?: string): string[] {
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

async function findModuleIndex(projectPath?: string): Promise<{ root: string; indexPath: string } | null> {
  for (const root of moduleRootCandidates(projectPath)) {
    const indexPath = join(root, 'metadata', 'modules', 'index.json')
    if (await exists(indexPath)) return { root, indexPath }
  }
  return null
}

export async function listEchoModules(projectPath?: string): Promise<EchoModuleCatalogResult> {
  const found = await findModuleIndex(projectPath)
  if (!found) {
    return {
      catalog: mergeModuleCatalog([]),
      source: 'builtin',
      warnings: ['Local ECHO-Modules metadata/modules/index.json was not found. Using built-in starter catalog.']
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
      warnings: raw.modules?.length ? [] : ['Local module index was readable but did not contain modules.']
    }
  } catch (error) {
    return {
      catalog: mergeModuleCatalog([]),
      source: 'builtin',
      indexPath: found.indexPath,
      moduleRoot: found.root,
      warnings: [`Failed to read local module index: ${error instanceof Error ? error.message : String(error)}`]
    }
  }
}
