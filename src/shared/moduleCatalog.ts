import type { AddonManifest } from './types'

export type EchoModuleStatus = 'stable' | 'beta' | 'experimental' | 'internal' | 'deprecated'
export type EchoModuleKind = 'foundation' | 'library' | 'addon' | 'ui_pack' | 'developer_tool' | 'story' | 'world' | 'tech'
export type EchoModuleTrustLevel = 'official' | 'trusted' | 'sandboxed' | 'community' | 'unknown' | 'blocked'

export interface EchoModuleRecord {
  id: string
  aliases: string[]
  name: string
  version?: string
  role: string
  kind: EchoModuleKind
  status: EchoModuleStatus
  channel: 'alpha' | 'beta' | 'stable' | 'internal'
  standaloneReady: boolean
  launcherVisible: boolean
  ashfallRequired: boolean
  publicApi: 'stable' | 'beta' | 'experimental' | 'internal' | 'deprecated'
  trustLevel?: EchoModuleTrustLevel
  blocked?: boolean
  blockReason?: string
  requires: string[]
  optional: string[]
  provides: string[]
  consumes?: string[]
  runtimes: Array<'neoforge' | 'echo_native' | 'standalone'>
  creatorUse: string
  source?: 'builtin' | 'local-index' | 'release-index'
  moduleDir?: string
  descriptorPath?: string
  catalogPath?: string
}

export interface EchoModulesIndexEntry {
  id: string
  name?: string
  version?: string
  kind?: string
  role?: string
  channel?: string
  official?: boolean
  trustLevel?: string
  blocked?: boolean
  blockReason?: string
  side?: string
  standalone?: boolean
  launcherVisible?: boolean
  ashfallRequired?: boolean
  descriptorPath?: string
  moduleDir?: string
  requires?: string[]
  optional?: string[]
  provides?: string[]
  consumes?: string[]
  apiStability?: string
}

export interface EchoModulesIndex {
  schemaVersion?: number | string
  generatedFrom?: string
  generatedAt?: string
  moduleCount?: number
  modules?: EchoModulesIndexEntry[]
}

export interface EchoModuleCatalogResult {
  catalog: EchoModuleRecord[]
  source: 'builtin' | 'local-index'
  indexPath?: string
  moduleRoot?: string
  generatedAt?: string
  warnings: string[]
}

export interface ProjectModulePlan {
  declared: string[]
  normalizedDeclared: string[]
  targetModules: EchoModuleRecord[]
  requiredModules: EchoModuleRecord[]
  optionalModules: EchoModuleRecord[]
  enabled: EchoModuleRecord[]
  unknown: string[]
  missingRequired: EchoModuleRecord[]
  optionalAvailable: EchoModuleRecord[]
  closure: EchoModuleRecord[]
}

export const ECHO_MODULE_CATALOG: EchoModuleRecord[] = [
  {
    id: 'echocore',
    aliases: ['echo:core'],
    name: 'Core',
    role: 'foundation',
    kind: 'foundation',
    status: 'stable',
    channel: 'stable',
    standaloneReady: false,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'stable',
    requires: [],
    optional: ['echonetcore', 'echodatacore', 'echoruntimeguard'],
    provides: ['Core services', 'runtime modules', 'configuration', 'diagnostics'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Base services every ECHO project builds on.'
  },
  {
    id: 'echonetcore',
    aliases: ['echo:net_core'],
    name: 'NetCore',
    role: 'networking',
    kind: 'foundation',
    status: 'stable',
    channel: 'stable',
    standaloneReady: false,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'stable',
    requires: ['echocore'],
    optional: ['echoruntimeguard'],
    provides: ['Sync contracts', 'packet APIs', 'safe network hooks'],
    runtimes: ['neoforge', 'echo_native'],
    creatorUse: 'Networking and synchronization for multiplayer-aware content.'
  },
  {
    id: 'echoadaptercore',
    aliases: ['echo:adapter_core'],
    name: 'AdapterCore',
    role: 'platform',
    kind: 'foundation',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore'],
    optional: [],
    provides: ['NeoForge adapter', 'native adapter', 'standalone adapter'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Runtime bridge for projects that target more than one platform.'
  },
  {
    id: 'echodatacore',
    aliases: ['echo:data_core'],
    name: 'DataCore',
    role: 'data',
    kind: 'foundation',
    status: 'stable',
    channel: 'stable',
    standaloneReady: false,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'stable',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoruntimeguard'],
    provides: ['Namespaced data', 'migrations', 'save data helpers'],
    runtimes: ['neoforge', 'echo_native'],
    creatorUse: 'Persistent data, migrations, and namespaced project state.'
  },
  {
    id: 'echoruntimeguard',
    aliases: ['echo:runtime_guard'],
    name: 'RuntimeGuard',
    role: 'safety',
    kind: 'foundation',
    status: 'stable',
    channel: 'stable',
    standaloneReady: false,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'stable',
    requires: ['echocore', 'echonetcore'],
    optional: ['echodatacore'],
    provides: ['Runtime safety checks', 'compatibility guards', 'diagnostics'],
    runtimes: ['neoforge', 'echo_native'],
    creatorUse: 'Safety checks for packs that load many modules or addons.'
  },
  {
    id: 'echomissioncore',
    aliases: ['echo:mission_core'],
    name: 'MissionCore',
    role: 'missions',
    kind: 'library',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echoadaptercore', 'echocore', 'echonetcore'],
    optional: ['echodatacore', 'echoindex', 'echoterminal', 'echotutorialcore'],
    provides: ['Mission objectives', 'routes', 'rewards', 'mission progression'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Mission packs, objectives, rewards, and progression routes.'
  },
  {
    id: 'echorecipecore',
    aliases: ['echo:recipe_core'],
    name: 'RecipeCore',
    role: 'recipes',
    kind: 'library',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoindex', 'echoterminal'],
    provides: ['Recipe registration', 'machine recipes', 'crafting hooks'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Crafting and machine recipes for gameplay packs.'
  },
  {
    id: 'echoscreencore',
    aliases: ['echo:screen_core'],
    name: 'ScreenCore',
    role: 'interface',
    kind: 'ui_pack',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echothemecore', 'echoterminal'],
    provides: ['Screen contracts', 'EUI actions', 'data-bound screens'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Custom screens, HUD surfaces, and UI flows.'
  },
  {
    id: 'echothemecore',
    aliases: ['echo:theme_core'],
    name: 'ThemeCore',
    role: 'theme',
    kind: 'ui_pack',
    status: 'stable',
    channel: 'stable',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'stable',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoscreencore', 'echoterminal', 'echoholomap'],
    provides: ['Theme tokens', 'skins', 'default dark fallback'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Theme tokens and skins shared across UI modules.'
  },
  {
    id: 'echoholomap',
    aliases: ['echo:holomap'],
    name: 'HoloMap',
    role: 'map',
    kind: 'ui_pack',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoworldcore', 'echomissioncore', 'echothemecore', 'echolens'],
    provides: ['Map layers', 'markers', 'routes', 'waypoints'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Map markers, routes, world layers, and mission locations.'
  },
  {
    id: 'echoindex',
    aliases: ['echo:index'],
    name: 'Index',
    role: 'knowledge',
    kind: 'ui_pack',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoterminal', 'echothemecore', 'echomissioncore', 'echowiki'],
    provides: ['Guide entries', 'lore records', 'item documentation'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'In-game documentation, lore, item references, and unlockable records.'
  },
  {
    id: 'echoterminal',
    aliases: ['echo:terminal'],
    name: 'Terminal',
    role: 'command hub',
    kind: 'ui_pack',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echothemecore', 'echoindex', 'echomissioncore', 'echoholomap', 'echolens'],
    provides: ['Command hub', 'debug pages', 'creator pages'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'In-game terminal pages and operational dashboards.'
  },
  {
    id: 'echoworldcore',
    aliases: ['echo:world_core'],
    name: 'WorldCore',
    role: 'world',
    kind: 'world',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoholomap', 'echoindex', 'echolens', 'echodatacore'],
    provides: ['Regions', 'hazards', 'discoveries', 'world metadata'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Regions, hazards, discoveries, and world-facing systems.'
  },
  {
    id: 'echolens',
    aliases: ['echo:lens'],
    name: 'Lens',
    role: 'scanner',
    kind: 'ui_pack',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoindex', 'echoholomap', 'echomissioncore', 'echothemecore'],
    provides: ['Scanner HUD', 'scan providers', 'scan objectives'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Scanning mechanics, discovery loops, and analysis UI.'
  },
  {
    id: 'echosoundcore',
    aliases: ['echo:sound_core'],
    name: 'SoundCore',
    role: 'audio',
    kind: 'library',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: true,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echothemecore', 'echoweathercore'],
    provides: ['Music rules', 'ambience zones', 'sound profiles'],
    runtimes: ['neoforge', 'echo_native', 'standalone'],
    creatorUse: 'Music, ambience, stingers, and sound-triggered gameplay.'
  },
  {
    id: 'echoscriptcore',
    aliases: ['echo:script_core'],
    name: 'ScriptCore',
    role: 'scripting',
    kind: 'developer_tool',
    status: 'experimental',
    channel: 'alpha',
    standaloneReady: true,
    launcherVisible: false,
    ashfallRequired: false,
    publicApi: 'experimental',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoschemacore', 'echovalidationcore'],
    provides: ['Script hooks', 'script validation', 'safe command lanes'],
    runtimes: ['echo_native', 'standalone'],
    creatorUse: 'Advanced scripted behavior. Best kept behind Developer mode.'
  },
  {
    id: 'echoagentcore',
    aliases: ['echo:agent_core'],
    name: 'AgentCore',
    role: 'codex',
    kind: 'developer_tool',
    status: 'beta',
    channel: 'beta',
    standaloneReady: true,
    launcherVisible: false,
    ashfallRequired: false,
    publicApi: 'beta',
    requires: ['echoadaptercore', 'echocore', 'echomodulegraph', 'echoschemacore'],
    optional: ['echobridgecore', 'echoreportcore'],
    provides: ['Task queues', 'prompt bundles', 'run reports'],
    runtimes: ['echo_native', 'standalone'],
    creatorUse: 'Codex task orchestration, review queues, and generated repair plans.'
  },
  {
    id: 'echoashfallprotocol',
    aliases: ['echo:ashfall_protocol'],
    name: 'Ashfall Protocol',
    role: 'official pack',
    kind: 'story',
    status: 'beta',
    channel: 'beta',
    standaloneReady: false,
    launcherVisible: true,
    ashfallRequired: true,
    publicApi: 'beta',
    requires: ['echocore', 'echonetcore'],
    optional: ['echoterminal', 'echoindex', 'echomissioncore', 'echoholomap', 'echolens', 'echothemecore'],
    provides: ['Ashfall profile', 'official pack hooks', 'content host'],
    runtimes: ['neoforge', 'echo_native'],
    creatorUse: 'Target profile for Ashfall-compatible experiences.'
  }
]

function buildAliasMap(catalog: EchoModuleRecord[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const mod of catalog) {
    map.set(mod.id, mod.id)
    map.set(mod.id.replace(/^echo/, 'echo:'), mod.id)
    for (const alias of mod.aliases) map.set(alias.toLowerCase(), mod.id)
  }
  return map
}

export function normalizeModuleId(id: string, catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG): string {
  const key = id.trim().toLowerCase()
  if (!key) return key
  const alias = buildAliasMap(catalog).get(key)
  if (alias) return alias
  if (key.startsWith('echo:')) return `echo${key.slice(5).replace(/_/g, '')}`
  return key.replace(/_/g, '')
}

export function findEchoModule(id: string, catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG): EchoModuleRecord | undefined {
  const normalized = normalizeModuleId(id, catalog)
  return catalog.find((mod) => mod.id === normalized)
}

export function preferredModuleAlias(mod: EchoModuleRecord): string {
  return mod.aliases.find((alias) => alias.startsWith('echo:') && alias.includes('_'))
    ?? mod.aliases.find((alias) => alias.startsWith('echo:'))
    ?? mod.id
}

export function dependencyIncludes(dependencies: string[], id: string, catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG): boolean {
  const target = normalizeModuleId(id, catalog)
  return dependencies.some((dep) => normalizeModuleId(dep, catalog) === target)
}

export function getModuleDependencyClosure(ids: string[], catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG): EchoModuleRecord[] {
  const seen = new Set<string>()
  const out: EchoModuleRecord[] = []
  const visit = (id: string): void => {
    const mod = findEchoModule(id, catalog)
    if (!mod || seen.has(mod.id)) return
    seen.add(mod.id)
    for (const dep of mod.requires) visit(dep)
    out.push(mod)
  }
  for (const id of ids) visit(id)
  return out
}

function knownModulesFor(ids: string[], catalog: EchoModuleRecord[]): EchoModuleRecord[] {
  const seen = new Set<string>()
  const out: EchoModuleRecord[] = []
  for (const id of ids) {
    const mod = findEchoModule(id, catalog)
    if (!mod || seen.has(mod.id)) continue
    seen.add(mod.id)
    out.push(mod)
  }
  return out
}

export function resolveProjectModulePlan(manifest: AddonManifest, catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG): ProjectModulePlan {
  const declared = Array.from(
    new Set([
      ...manifest.dependencies.required,
      ...manifest.dependencies.optional,
      ...manifest.target.modules
    ])
  )
  const normalizedDeclared = Array.from(new Set(declared.map((id) => normalizeModuleId(id, catalog)).filter(Boolean)))
  const targetModules = knownModulesFor(manifest.target.modules, catalog)
  const requiredModules = knownModulesFor(manifest.dependencies.required, catalog)
  const optionalModules = knownModulesFor(manifest.dependencies.optional, catalog)
  const enabled = knownModulesFor(normalizedDeclared, catalog)
  const knownIds = new Set(enabled.map((mod) => mod.id))
  const unknown = declared.filter((id) => !findEchoModule(id, catalog))
  const closure = getModuleDependencyClosure(normalizedDeclared, catalog)
  const missingRequired = closure.filter((mod) => !knownIds.has(mod.id))
  const optionalAvailable = enabled
    .flatMap((mod) => mod.optional)
    .map((id) => findEchoModule(id, catalog))
    .filter((mod): mod is EchoModuleRecord => Boolean(mod))
    .filter((mod, index, arr) => !knownIds.has(mod.id) && arr.findIndex((other) => other.id === mod.id) === index)

  return {
    declared,
    normalizedDeclared,
    targetModules,
    requiredModules,
    optionalModules,
    enabled,
    unknown,
    missingRequired,
    optionalAvailable,
    closure
  }
}

function appendUniqueModuleAlias(list: string[], id: string, catalog: EchoModuleRecord[]): string[] {
  const normalized = normalizeModuleId(id, catalog)
  if (list.some((item) => normalizeModuleId(item, catalog) === normalized)) return list
  return [...list, id]
}

function removeModuleAliases(list: string[], ids: string[], catalog: EchoModuleRecord[]): string[] {
  const normalized = new Set(ids.map((id) => normalizeModuleId(id, catalog)))
  return list.filter((item) => !normalized.has(normalizeModuleId(item, catalog)))
}

function moduleClosureAliases(modules: EchoModuleRecord[], catalog: EchoModuleRecord[]): string[] {
  const byId = new Map<string, string>()
  for (const mod of modules) {
    for (const closureMod of getModuleDependencyClosure([mod.id], catalog)) {
      if (!byId.has(closureMod.id)) byId.set(closureMod.id, preferredModuleAlias(closureMod))
    }
  }
  return Array.from(byId.values())
}

export function addRequiredModuleClosureToManifest(
  manifest: AddonManifest,
  modules: EchoModuleRecord[],
  catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG
): AddonManifest {
  const closureAliases = moduleClosureAliases(modules, catalog)
  return {
    ...manifest,
    target: {
      ...manifest.target,
      modules: closureAliases.reduce((list, id) => appendUniqueModuleAlias(list, id, catalog), manifest.target.modules)
    },
    dependencies: {
      required: closureAliases.reduce((list, id) => appendUniqueModuleAlias(list, id, catalog), manifest.dependencies.required),
      optional: removeModuleAliases(manifest.dependencies.optional, closureAliases, catalog)
    }
  }
}

export function addModuleToManifest(
  manifest: AddonManifest,
  mod: EchoModuleRecord,
  kind: 'required' | 'optional',
  catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG
): AddonManifest {
  if (kind === 'required') return addRequiredModuleClosureToManifest(manifest, [mod], catalog)

  const selectedAlias = preferredModuleAlias(mod)
  const selectedId = normalizeModuleId(selectedAlias, catalog)
  const closureAliases = moduleClosureAliases([mod], catalog)
  const requiredAliases = closureAliases.filter((id) => normalizeModuleId(id, catalog) !== selectedId)
  const required = requiredAliases.reduce((list, id) => appendUniqueModuleAlias(list, id, catalog), manifest.dependencies.required)
  const selectedAlreadyRequired = required.some((id) => normalizeModuleId(id, catalog) === selectedId)
  const optionalBase = removeModuleAliases(manifest.dependencies.optional, requiredAliases, catalog)

  return {
    ...manifest,
    target: {
      ...manifest.target,
      modules: closureAliases.reduce((list, id) => appendUniqueModuleAlias(list, id, catalog), manifest.target.modules)
    },
    dependencies: {
      required,
      optional: selectedAlreadyRequired
        ? optionalBase
        : appendUniqueModuleAlias(optionalBase, selectedAlias, catalog)
    }
  }
}

export function modulesForCapability(
  capability: 'missions' | 'recipes' | 'interface' | 'map' | 'knowledge' | 'developer',
  catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG
): EchoModuleRecord[] {
  const map: Record<typeof capability, string[]> = {
    missions: ['echomissioncore', 'echoindex', 'echoholomap'],
    recipes: ['echorecipecore', 'echoindex'],
    interface: ['echoscreencore', 'echothemecore', 'echoterminal'],
    map: ['echoholomap', 'echoworldcore', 'echolens'],
    knowledge: ['echoindex', 'echowiki', 'echoterminal'],
    developer: ['echoagentcore', 'echoscriptcore', 'echoruntimeguard']
  }
  return map[capability].map((id) => findEchoModule(id, catalog)).filter((mod): mod is EchoModuleRecord => Boolean(mod))
}

function inferKind(entry: EchoModulesIndexEntry): EchoModuleKind {
  const role = (entry.role ?? '').toLowerCase()
  const kind = (entry.kind ?? '').toLowerCase()
  if (kind === 'ui_pack' || ['terminal', 'theme', 'map', 'scanner', 'knowledge'].includes(role)) return 'ui_pack'
  if (kind === 'developer_tool' || role.includes('agent') || role.includes('script') || role.includes('tool')) return 'developer_tool'
  if (['foundation', 'platform', 'sdk_spine', 'safety', 'data'].includes(role)) return 'foundation'
  if (['story', 'official pack'].includes(role)) return 'story'
  if (['world', 'survival'].includes(role)) return 'world'
  if (['tech', 'recipes', 'networking'].includes(role)) return 'tech'
  if (kind === 'library' || kind === 'public_api') return 'library'
  return kind === 'addon' ? 'addon' : 'library'
}

function inferStatus(entry: EchoModulesIndexEntry): EchoModuleStatus {
  const channel = (entry.channel ?? '').toLowerCase()
  const api = (entry.apiStability ?? '').toLowerCase()
  if (channel.includes('internal') || api.includes('internal')) return 'internal'
  if (channel.includes('deprecated') || api.includes('deprecated')) return 'deprecated'
  if (channel === 'stable' || api === 'stable') return 'stable'
  if (channel === 'beta' || api === 'beta') return 'beta'
  return 'experimental'
}

function inferChannel(entry: EchoModulesIndexEntry): EchoModuleRecord['channel'] {
  const value = (entry.channel ?? '').toLowerCase()
  if (value === 'stable' || value === 'beta' || value === 'alpha' || value === 'internal') return value
  return inferStatus(entry) === 'stable' ? 'stable' : inferStatus(entry) === 'beta' ? 'beta' : 'alpha'
}

function inferPublicApi(entry: EchoModulesIndexEntry): EchoModuleRecord['publicApi'] {
  const value = (entry.apiStability ?? '').toLowerCase()
  if (value === 'stable' || value === 'beta' || value === 'experimental' || value === 'internal' || value === 'deprecated') return value
  return inferStatus(entry)
}

function inferTrustLevel(entry: EchoModulesIndexEntry): EchoModuleTrustLevel {
  const value = (entry.trustLevel ?? '').toLowerCase()
  if (value === 'official' || value === 'trusted' || value === 'sandboxed' || value === 'community' || value === 'blocked') return value
  return entry.official ? 'official' : value ? 'unknown' : 'community'
}

function inferBlocked(entry: EchoModulesIndexEntry): boolean {
  return Boolean(entry.blocked) ||
    (entry.trustLevel ?? '').toLowerCase() === 'blocked' ||
    (entry.channel ?? '').toLowerCase() === 'blocked' ||
    (entry.apiStability ?? '').toLowerCase() === 'blocked'
}

function inferRuntimes(entry: EchoModulesIndexEntry): EchoModuleRecord['runtimes'] {
  const out: EchoModuleRecord['runtimes'] = ['neoforge', 'echo_native']
  if (entry.standalone) out.push('standalone')
  return out
}

function moduleName(entry: EchoModulesIndexEntry): string {
  return (entry.name ?? entry.id)
    .replace(/^ECHO:\s*/i, '')
    .replace(/\s+by ECHO Labs$/i, '')
}

function aliasForId(id: string): string[] {
  if (!id.startsWith('echo')) return []
  const raw = id.slice(4)
  if (!raw) return ['echo:core']
  if (raw.toLowerCase() === 'core') return ['echo:core']
  const snake = raw.replace(/core$/i, '_core')
  return Array.from(new Set([`echo:${raw}`, `echo:${snake}`]))
}

export function moduleFromIndexEntry(entry: EchoModulesIndexEntry, context?: { catalogPath?: string; moduleRoot?: string }): EchoModuleRecord {
  const id = normalizeModuleId(entry.id)
  const name = moduleName(entry)
  return {
    id,
    aliases: aliasForId(id),
    name,
    version: entry.version,
    role: entry.role ?? 'module',
    kind: inferKind(entry),
    status: inferStatus(entry),
    channel: inferChannel(entry),
    standaloneReady: Boolean(entry.standalone),
    launcherVisible: entry.launcherVisible ?? inferStatus(entry) !== 'internal',
    ashfallRequired: Boolean(entry.ashfallRequired),
    publicApi: inferPublicApi(entry),
    trustLevel: inferTrustLevel(entry),
    blocked: inferBlocked(entry),
    ...(entry.blockReason ? { blockReason: entry.blockReason } : {}),
    requires: (entry.requires ?? []).map((dep) => normalizeModuleId(dep)),
    optional: (entry.optional ?? []).map((dep) => normalizeModuleId(dep)),
    provides: entry.provides ?? [],
    consumes: entry.consumes ?? [],
    runtimes: inferRuntimes(entry),
    creatorUse: `${name} provides ${(entry.provides ?? []).slice(0, 3).join(', ') || entry.role || 'ECHO module capabilities'}.`,
    source: 'local-index',
    moduleDir: entry.moduleDir,
    descriptorPath: entry.descriptorPath,
    catalogPath: context?.catalogPath
  }
}

export function mergeModuleCatalog(imported: EchoModuleRecord[], base: EchoModuleRecord[] = ECHO_MODULE_CATALOG): EchoModuleRecord[] {
  const merged = new Map<string, EchoModuleRecord>()
  for (const mod of base) merged.set(mod.id, { ...mod, source: mod.source ?? 'builtin' })
  for (const mod of imported) {
    const existing = merged.get(mod.id)
    merged.set(mod.id, existing ? { ...existing, ...mod, aliases: Array.from(new Set([...existing.aliases, ...mod.aliases])) } : mod)
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
}
