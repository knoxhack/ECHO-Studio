import type { AddonManifest } from './types'

export type EchoModuleStatus = 'stable' | 'beta' | 'experimental' | 'internal' | 'deprecated'
export type EchoModuleKind = 'foundation' | 'library' | 'addon' | 'ui_pack' | 'developer_tool' | 'story' | 'world' | 'tech'

export interface EchoModuleRecord {
  id: string
  aliases: string[]
  name: string
  role: string
  kind: EchoModuleKind
  status: EchoModuleStatus
  channel: 'alpha' | 'beta' | 'stable' | 'internal'
  standaloneReady: boolean
  launcherVisible: boolean
  ashfallRequired: boolean
  publicApi: 'stable' | 'beta' | 'experimental' | 'internal' | 'deprecated'
  requires: string[]
  optional: string[]
  provides: string[]
  runtimes: Array<'neoforge' | 'echo_native' | 'standalone'>
  creatorUse: string
}

export interface ProjectModulePlan {
  declared: string[]
  normalizedDeclared: string[]
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

const aliasToId = new Map<string, string>()
for (const mod of ECHO_MODULE_CATALOG) {
  aliasToId.set(mod.id, mod.id)
  aliasToId.set(mod.id.replace(/^echo/, 'echo:'), mod.id)
  for (const alias of mod.aliases) aliasToId.set(alias.toLowerCase(), mod.id)
}

export function normalizeModuleId(id: string): string {
  const key = id.trim().toLowerCase()
  if (!key) return key
  const alias = aliasToId.get(key)
  if (alias) return alias
  if (key.startsWith('echo:')) return `echo${key.slice(5).replace(/_/g, '')}`
  return key.replace(/_/g, '')
}

export function findEchoModule(id: string): EchoModuleRecord | undefined {
  const normalized = normalizeModuleId(id)
  return ECHO_MODULE_CATALOG.find((mod) => mod.id === normalized)
}

export function dependencyIncludes(dependencies: string[], id: string): boolean {
  const target = normalizeModuleId(id)
  return dependencies.some((dep) => normalizeModuleId(dep) === target)
}

export function getModuleDependencyClosure(ids: string[]): EchoModuleRecord[] {
  const seen = new Set<string>()
  const out: EchoModuleRecord[] = []
  const visit = (id: string): void => {
    const mod = findEchoModule(id)
    if (!mod || seen.has(mod.id)) return
    seen.add(mod.id)
    for (const dep of mod.requires) visit(dep)
    out.push(mod)
  }
  for (const id of ids) visit(id)
  return out
}

export function resolveProjectModulePlan(manifest: AddonManifest): ProjectModulePlan {
  const declared = Array.from(
    new Set([
      ...manifest.dependencies.required,
      ...manifest.dependencies.optional,
      ...manifest.target.modules
    ])
  )
  const normalizedDeclared = Array.from(new Set(declared.map(normalizeModuleId).filter(Boolean)))
  const enabled = normalizedDeclared.map(findEchoModule).filter((mod): mod is EchoModuleRecord => Boolean(mod))
  const knownIds = new Set(enabled.map((mod) => mod.id))
  const unknown = declared.filter((id) => !findEchoModule(id))
  const closure = getModuleDependencyClosure(normalizedDeclared)
  const missingRequired = closure.filter((mod) => !knownIds.has(mod.id))
  const optionalAvailable = enabled
    .flatMap((mod) => mod.optional)
    .map(findEchoModule)
    .filter((mod): mod is EchoModuleRecord => Boolean(mod))
    .filter((mod, index, arr) => !knownIds.has(mod.id) && arr.findIndex((other) => other.id === mod.id) === index)

  return {
    declared,
    normalizedDeclared,
    enabled,
    unknown,
    missingRequired,
    optionalAvailable,
    closure
  }
}

export function modulesForCapability(capability: 'missions' | 'recipes' | 'interface' | 'map' | 'knowledge' | 'developer'): EchoModuleRecord[] {
  const map: Record<typeof capability, string[]> = {
    missions: ['echomissioncore', 'echoindex', 'echoholomap'],
    recipes: ['echorecipecore', 'echoindex'],
    interface: ['echoscreencore', 'echothemecore', 'echoterminal'],
    map: ['echoholomap', 'echoworldcore', 'echolens'],
    knowledge: ['echoindex', 'echowiki', 'echoterminal'],
    developer: ['echoagentcore', 'echoscriptcore', 'echoruntimeguard']
  }
  return map[capability].map(findEchoModule).filter((mod): mod is EchoModuleRecord => Boolean(mod))
}
