import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { readManifest, defaultWorkspace } from './fsService'
import type { AddonManifest, Runtime, TargetExperience } from '../shared/types'
import { computeLoadOrder, summarizeBundleModules, type BundleMember, type BundleModuleSummary, type ExperienceResult, type ServerPackResult } from '../shared/bundles'
import { listEchoModules } from './moduleCatalogService'

const ECHO_PACK_MANIFEST_FILE = 'echo-pack.json'
const ECHO_PACK_LOCK_FILE = 'echo-pack.lock.json'
const LEGACY_PACKOS_LOCK_FILE = 'packos.lockfile.json'

type EchoPackKind = 'community_experience' | 'server_pack'

interface BuildEchoPackInput {
  kind: EchoPackKind
  id: string
  name: string
  version: string
  generatedAt: string
  namespace?: string
  members: BundleMember[]
  manifests: AddonManifest[]
  loadOrder: string[]
  moduleSummary: BundleModuleSummary
  catalogSource: string
  warnings: string[]
  requiredClientAddons?: string[]
}

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

function sorted<T extends string>(values: Iterable<T>): T[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

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
      blocked: Boolean(mod.blocked),
      blockReason: mod.blockReason,
      source: mod.source,
      localSource: mod.localSource
    })),
    issues: {
      missingRequired: summary.missingRequired,
      unknown: summary.unknown,
      blocked: summary.blocked
    }
  }
}

function bundleCompatibility(manifests: AddonManifest[]): { targetExperiences: TargetExperience[]; runtimes: Runtime[] } {
  return {
    targetExperiences: sorted(manifests.flatMap((manifest) => manifest.target.experiences)),
    runtimes: sorted(manifests.flatMap((manifest) => manifest.runtime.supports))
  }
}

function dependencyRules(manifests: AddonManifest[]): Array<{ id: string; required: string[]; optional: string[] }> {
  return manifests.map((manifest) => ({
    id: manifest.id,
    required: [...manifest.dependencies.required],
    optional: [...manifest.dependencies.optional]
  }))
}

function memberRecords(members: BundleMember[]): Array<{ id: string; name: string; version: string; manifestSha256: string; sourcePath: string }> {
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    version: member.version,
    manifestSha256: member.hash,
    sourcePath: member.path
  }))
}

function buildEchoPackManifest(input: BuildEchoPackInput): Record<string, unknown> {
  return {
    schemaVersion: 'echo.pack.v1',
    id: input.id,
    kind: input.kind,
    name: input.name,
    version: input.version,
    channel: 'local',
    generatedAt: input.generatedAt,
    ...(input.namespace ? { namespace: input.namespace } : {}),
    compatibility: bundleCompatibility(input.manifests),
    members: memberRecords(input.members),
    loadOrder: input.loadOrder,
    dependencyRules: dependencyRules(input.manifests),
    ...(input.requiredClientAddons ? { requiredClientAddons: input.requiredClientAddons } : {}),
    moduleClosure: moduleMetadata(input.moduleSummary, input.catalogSource),
    validation: {
      state: input.warnings.length > 0 ? 'warning' : 'ready',
      warnings: input.warnings
    }
  }
}

function buildEchoPackLock(input: BuildEchoPackInput): Record<string, unknown> {
  return {
    schemaVersion: 'echo.pack.lock.v1',
    id: input.id,
    kind: input.kind,
    generatedAt: input.generatedAt,
    catalogSource: input.catalogSource,
    members: memberRecords(input.members),
    loadOrder: input.loadOrder,
    moduleClosure: moduleMetadata(input.moduleSummary, input.catalogSource),
    validation: {
      state: input.warnings.length > 0 ? 'warning' : 'ready',
      warnings: input.warnings
    }
  }
}

function legacyLockfile(generatedAt: string, members: BundleMember[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt,
    members: members.map((member) => ({ id: member.id, version: member.version, hash: member.hash }))
  }
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8')
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, jsonBuffer(value))
}

// Build a Community Experience bundle: a project folder with experience.json +
// echo-pack.json describing members, load order, modules and dependency rules.
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
  const generatedAt = new Date().toISOString()
  const packId = `${namespace}:${id}`

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
    id: packId,
    name,
    projectClass: 'community_experience',
    namespace,
    members: members.map((m) => ({ id: m.id, version: m.version })),
    loadOrder: order,
    dependencyRules: manifests.map((m) => ({ id: m.id, requires: m.dependencies.required })),
    moduleClosure: moduleMetadata(moduleSummary, moduleCatalog.source)
  }
  const packInput: BuildEchoPackInput = {
    kind: 'community_experience',
    id: packId,
    name,
    version: '0.1.0',
    generatedAt,
    namespace,
    members,
    manifests,
    loadOrder: order,
    moduleSummary,
    catalogSource: moduleCatalog.source,
    warnings
  }
  const packManifestPath = join(dir, ECHO_PACK_MANIFEST_FILE)
  const packLockPath = join(dir, ECHO_PACK_LOCK_FILE)
  const legacyLockPath = join(dir, LEGACY_PACKOS_LOCK_FILE)
  await writeJson(join(dir, 'experience.json'), experience)
  await writeJson(packManifestPath, buildEchoPackManifest(packInput))
  await writeJson(packLockPath, buildEchoPackLock(packInput))
  await writeJson(legacyLockPath, legacyLockfile(generatedAt, members))
  await fs.writeFile(
    join(dir, 'README.md'),
    `# ${name}\n\nA community experience bundling ${members.length} addons.\n\nLoad order:\n${order.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n`,
    'utf-8'
  )

  return { path: dir, packManifestPath, packLockPath, legacyLockPath, loadOrder: order, members, moduleSummary, warnings }
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
  const { order, warnings: loadOrderWarnings } = computeLoadOrder(manifests)
  warnings.push(...loadOrderWarnings, ...moduleCatalog.warnings, ...moduleWarnings(moduleSummary))
  const generatedAt = new Date().toISOString()

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
  const packInput: BuildEchoPackInput = {
    kind: 'server_pack',
    id: sanitize(name),
    name,
    version: '0.1.0',
    generatedAt,
    members,
    manifests,
    loadOrder: order,
    moduleSummary,
    catalogSource: moduleCatalog.source,
    warnings,
    requiredClientAddons
  }
  zip.addFile('server.profile.json', jsonBuffer(serverProfile))
  zip.addFile(ECHO_PACK_MANIFEST_FILE, jsonBuffer(buildEchoPackManifest(packInput)))
  zip.addFile(ECHO_PACK_LOCK_FILE, jsonBuffer(buildEchoPackLock(packInput)))
  for (const l of loaded) {
    const raw = await fs.readFile(join(l.member.path, 'echo.mod.json'), 'utf-8')
    zip.addFile(`addons/${l.manifest.namespace}_${local(l.manifest.id)}/echo.mod.json`, Buffer.from(raw, 'utf-8'))
  }

  const workspace = workspaceDir || defaultWorkspace()
  const exportsDir = join(workspace, '_server_packs')
  await fs.mkdir(exportsDir, { recursive: true })
  const zipPath = join(exportsDir, `${sanitize(name)}-serverpack.zip`)
  zip.writeZip(zipPath)

  return { zipPath, packManifestFile: ECHO_PACK_MANIFEST_FILE, packLockFile: ECHO_PACK_LOCK_FILE, requiredClientAddons, moduleSummary, warnings, members }
}

function local(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}
function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}
