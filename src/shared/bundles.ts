import type { AddonManifest } from './types'

export interface BundleMember {
  id: string
  name: string
  version: string
  path: string
  hash: string
}

export interface ExperienceResult {
  path: string
  loadOrder: string[]
  members: BundleMember[]
  warnings: string[]
}

export interface ServerPackResult {
  zipPath: string
  requiredClientAddons: string[]
  warnings: string[]
  members: BundleMember[]
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
