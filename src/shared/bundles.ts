import type { AddonManifest } from './types'
import {
  preferredModuleAlias,
  resolveProjectModulePlan,
  type EchoModuleRecord,
  type EchoModuleTrustLevel
} from './moduleCatalog'

export interface BundleModuleRecord {
  id: string
  alias: string
  name: string
  role: string
  status: string
  publicApi: string
  trustLevel?: EchoModuleTrustLevel
  blocked?: boolean
  blockReason?: string
  source?: string
  localSource: boolean
}

export interface BundleModuleSummary {
  moduleCount: number
  localModuleCount: number
  modules: BundleModuleRecord[]
  missingRequired: string[]
  unknown: string[]
  blocked: string[]
}

export interface BundleMember {
  id: string
  name: string
  version: string
  path: string
  hash: string
}

export interface ExperienceResult {
  path: string
  packManifestPath: string
  packLockPath: string
  legacyLockPath: string
  loadOrder: string[]
  members: BundleMember[]
  moduleSummary: BundleModuleSummary
  warnings: string[]
}

export interface ServerPackResult {
  zipPath: string
  packManifestFile: string
  packLockFile: string
  requiredClientAddons: string[]
  moduleSummary: BundleModuleSummary
  warnings: string[]
  members: BundleMember[]
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

export function summarizeBundleModules(manifests: AddonManifest[], catalog: EchoModuleRecord[]): BundleModuleSummary {
  const modules = new Map<string, BundleModuleRecord>()
  const missingRequired = new Set<string>()
  const unknown = new Set<string>()
  const blocked = new Set<string>()

  for (const manifest of manifests) {
    const plan = resolveProjectModulePlan(manifest, catalog)
    for (const mod of plan.closure) {
      if (!modules.has(mod.id)) {
        modules.set(mod.id, {
          id: mod.id,
          alias: preferredModuleAlias(mod),
          name: mod.name,
          role: mod.role,
          status: mod.status,
          publicApi: mod.publicApi,
          ...(mod.trustLevel ? { trustLevel: mod.trustLevel } : {}),
          ...(mod.blocked ? { blocked: mod.blocked } : {}),
          ...(mod.blockReason ? { blockReason: mod.blockReason } : {}),
          ...(mod.source ? { source: mod.source } : {}),
          localSource: Boolean(mod.moduleDir || mod.descriptorPath)
        })
      }
    }
    for (const mod of plan.missingRequired) missingRequired.add(preferredModuleAlias(mod))
    for (const id of plan.unknown) unknown.add(id)
    for (const mod of plan.closure) {
      if (mod.blocked || mod.trustLevel === 'blocked') blocked.add(mod.name)
    }
  }

  const records = Array.from(modules.values()).sort((a, b) => a.name.localeCompare(b.name))
  return {
    moduleCount: records.length,
    localModuleCount: records.filter((mod) => mod.localSource).length,
    modules: records,
    missingRequired: sorted(missingRequired),
    unknown: sorted(unknown),
    blocked: sorted(blocked)
  }
}

// Topologically order members so dependencies load first. Members that depend
// on another member's id are placed after it; unresolved deps are ignored
// because they are assumed to be ECHO modules or external dependencies.
export function computeLoadOrder(manifests: AddonManifest[]): { order: string[]; warnings: string[] } {
  const ids = new Set(manifests.map((manifest) => manifest.id))
  const warnings: string[] = []
  const graph = new Map<string, string[]>()
  for (const manifest of manifests) {
    const deps = [...manifest.dependencies.required, ...manifest.dependencies.optional].filter((dep) => ids.has(dep))
    graph.set(manifest.id, deps)
  }
  const order: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      warnings.push(`Circular dependency involving ${id}; load order may be unstable.`)
      return
    }
    visiting.add(id)
    for (const dep of graph.get(id) ?? []) visit(dep)
    visiting.delete(id)
    visited.add(id)
    order.push(id)
  }
  for (const manifest of manifests) visit(manifest.id)
  return { order, warnings }
}
