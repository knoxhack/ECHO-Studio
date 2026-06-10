import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { readManifest, defaultWorkspace } from './fsService'
import type { AddonManifest } from '../shared/types'
import { computeLoadOrder, summarizeBundleModules, type BundleMember, type BundleModuleSummary, type ExperienceResult, type ServerPackResult } from '../shared/bundles'
import { listEchoModules } from './moduleCatalogService'

async function loadMember(path: string): Promise<{ manifest: AddonManifest; member: BundleMember }> {
  const manifest = await readManifest(path)
  if (!manifest) throw new Error(`Missing echo.mod.json in ${path}`)
  const raw = JSON.stringify(manifest)
  const hash = createHash('sha256').update(raw).digest('hex')
  return {
    manifest,
    member: { id: manifest.id, name: manifest.name, version: manifest.version, path, hash }
  }
}

export { computeLoadOrder } from '../shared/bundles'

function moduleWarnings(summary: BundleModuleSummary): string[] {
  const warnings: string[] = []
  if (summary.missingRequired.length > 0) {
    warnings.push(`Module closure missing from member manifests: ${summary.missingRequired.join(', ')}.`)
  }
  if (summary.unknown.length > 0) {
    warnings.push(`Unknown module or dependency references: ${summary.unknown.join(', ')}.`)
  }
  if (summary.blocked.length > 0) {
    warnings.push(`Blocked modules are present: ${summary.blocked.join(', ')}.`)
  }
  return warnings
}

function moduleMetadata(summary: BundleModuleSummary, catalogSource: string): Record<string, unknown> {
  return {
    catalogSource,
    moduleCount: summary.moduleCount,
    localModuleCount: summary.localModuleCount,
    modules: summary.modules.map((mod) => ({
      id: mod.id,
      alias: mod.alias,
      name: mod.name,
      role: mod.role,
      status: mod.status,
      publicApi: mod.publicApi,
      trustLevel: mod.trustLevel ?? 'unknown',
      localSource: mod.localSource
    })),
    issues: {
      missingRequired: summary.missingRequired,
      unknown: summary.unknown,
      blocked: summary.blocked
    }
  }
}

// Build a Community Experience bundle: a project folder with experience.json +
// lockfile.json describing members, load order and dependency rules.
export async function createExperience(
  workspaceDir: string,
  namespace: string,
  id: string,
  name: string,
  memberPaths: string[]
): Promise<ExperienceResult> {
  const loaded = await Promise.all(memberPaths.map(loadMember))
  const manifests = loaded.map((l) => l.manifest)
  const members = loaded.map((l) => l.member)
  const moduleCatalog = await listEchoModules(workspaceDir)
  const moduleSummary = summarizeBundleModules(manifests, moduleCatalog.catalog)
  const { order, warnings } = computeLoadOrder(manifests)
  warnings.push(...moduleCatalog.warnings, ...moduleWarnings(moduleSummary))

  // Compatibility warnings across members.
  const experiences = new Set(manifests.flatMap((m) => m.target.experiences))
  if (experiences.size > 1) {
    warnings.push(`Members target multiple experiences: ${[...experiences].join(', ')}.`)
  }

  const workspace = workspaceDir || defaultWorkspace()
  const dir = join(workspace, `${namespace}_${id}`)
  await fs.mkdir(dir, { recursive: true })

  const experience = {
    schemaVersion: 1,
    id: `${namespace}:${id}`,
    name,
    projectClass: 'community_experience',
    namespace,
    members: members.map((m) => ({ id: m.id, version: m.version })),
    loadOrder: order,
    dependencyRules: manifests.map((m) => ({ id: m.id, requires: m.dependencies.required })),
    moduleClosure: moduleMetadata(moduleSummary, moduleCatalog.source)
  }
  const lockfile = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    members: members.map((m) => ({ id: m.id, version: m.version, hash: m.hash }))
  }
  await fs.writeFile(join(dir, 'experience.json'), JSON.stringify(experience, null, 2), 'utf-8')
  await fs.writeFile(join(dir, 'packos.lockfile.json'), JSON.stringify(lockfile, null, 2), 'utf-8')
  await fs.writeFile(
    join(dir, 'README.md'),
    `# ${name}\n\nA community experience bundling ${members.length} addons.\n\nLoad order:\n${order.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n`,
    'utf-8'
  )

  return { path: dir, loadOrder: order, members, moduleSummary, warnings }
}

// Export a server pack zip: server profile + required client addon list +
// compatibility warnings. Bundles each member's manifest into the zip.
export async function exportServerPack(
  workspaceDir: string,
  name: string,
  memberPaths: string[]
): Promise<ServerPackResult> {
  const loaded = await Promise.all(memberPaths.map(loadMember))
  const manifests = loaded.map((l) => l.manifest)
  const members = loaded.map((l) => l.member)
  const moduleCatalog = await listEchoModules(workspaceDir)
  const moduleSummary = summarizeBundleModules(manifests, moduleCatalog.catalog)
  const warnings: string[] = []
  warnings.push(...moduleCatalog.warnings, ...moduleWarnings(moduleSummary))

  // Client addons are those that register UI/screens/content the client needs.
  const requiredClientAddons = manifests
    .filter((m) => m.permissions.some((p) => p.startsWith('screen.') || p === 'mission.register' || p === 'holomap.layers'))
    .map((m) => m.id)

  for (const m of manifests) {
    if (!m.runtime.supports.includes('neoforge') && m.projectClass !== 'server_module') {
      warnings.push(`${m.id} does not declare NeoForge support; server compatibility uncertain.`)
    }
  }

  const zip = new AdmZip()
  const serverProfile = {
    schemaVersion: 1,
    name,
    requiredClientAddons,
    members: members.map((m) => ({ id: m.id, version: m.version, hash: m.hash })),
    moduleClosure: moduleMetadata(moduleSummary, moduleCatalog.source),
    configProfiles: { default: { pvp: false, difficulty: 'normal' } }
  }
  zip.addFile('server.profile.json', Buffer.from(JSON.stringify(serverProfile, null, 2), 'utf-8'))
  for (const l of loaded) {
    const raw = await fs.readFile(join(l.member.path, 'echo.mod.json'), 'utf-8')
    zip.addFile(`addons/${l.manifest.namespace}_${local(l.manifest.id)}/echo.mod.json`, Buffer.from(raw, 'utf-8'))
  }

  const workspace = workspaceDir || defaultWorkspace()
  const exportsDir = join(workspace, '_server_packs')
  await fs.mkdir(exportsDir, { recursive: true })
  const zipPath = join(exportsDir, `${sanitize(name)}-serverpack.zip`)
  zip.writeZip(zipPath)

  return { zipPath, requiredClientAddons, moduleSummary, warnings, members }
}

function local(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}
function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}
