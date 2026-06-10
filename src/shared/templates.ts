import { SDK_VERSION } from './constants'
import {
  ECHO_MODULE_CATALOG,
  getModuleDependencyClosure,
  normalizeModuleId,
  preferredModuleAlias,
  type EchoModuleRecord
} from './moduleCatalog'
import type { AddonManifest, AddonType, CreateAddonOptions } from './types'
import type { AddonPackageManifest } from './addonPackageContract'

const PROJECT_CLASS: Record<AddonType, string> = {
  gameplay_addon: 'community_addon',
  mission_pack: 'community_addon',
  recipe_pack: 'community_addon',
  ui_addon: 'community_addon',
  holomap_layer: 'community_addon',
  index_pack: 'community_addon',
  world_pack: 'community_addon',
  theme_pack: 'community_addon',
  asset_pack: 'community_addon',
  server_module: 'server_module',
  community_experience: 'community_experience'
}

// Map an addon type to a sensible default permission/module set.
function defaultsForType(type: AddonType): { permissions: string[]; modules: string[]; required: string[] } {
  const base = { permissions: ['addon_storage.write'], modules: ['echo:core'], required: ['echo:core', 'echo:net_core'] }
  switch (type) {
    case 'mission_pack':
      return {
        permissions: ['mission.register', 'holomap.layers', 'index.entries', 'addon_storage.write'],
        modules: ['echo:mission_core', 'echo:holomap', 'echo:index'],
        required: ['echo:core', 'echo:net_core', 'echo:mission_core']
      }
    case 'recipe_pack':
      return {
        permissions: ['recipe.register', 'index.entries', 'addon_storage.write'],
        modules: ['echo:recipe_core', 'echo:index'],
        required: ['echo:core', 'echo:recipe_core']
      }
    case 'ui_addon':
    case 'theme_pack':
      return {
        permissions: ['screen.custom_ui', 'addon_storage.write'],
        modules: ['echo:screen_core'],
        required: ['echo:core', 'echo:screen_core']
      }
    case 'holomap_layer':
      return {
        permissions: ['holomap.layers', 'addon_storage.write'],
        modules: ['echo:holomap'],
        required: ['echo:core', 'echo:holomap']
      }
    case 'index_pack':
      return {
        permissions: ['index.entries', 'addon_storage.write'],
        modules: ['echo:index'],
        required: ['echo:core', 'echo:index']
      }
    default:
      return base
  }
}

function requiredModuleClosure(
  required: string[],
  modules: string[],
  catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG
): string[] {
  const out: string[] = []
  const add = (id: string): void => {
    if (!out.includes(id)) out.push(id)
  }
  for (const id of required) add(id)
  for (const mod of getModuleDependencyClosure([...required, ...modules], catalog)) add(preferredModuleAlias(mod))
  return out
}

export function buildManifest(opts: CreateAddonOptions, catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG): AddonManifest {
  const d = defaultsForType(opts.type)
  const required = requiredModuleClosure(d.required, d.modules, catalog)
  return {
    schemaVersion: 1,
    id: `${opts.namespace}:${opts.addonId}`,
    name: opts.name,
    version: '0.1.0',
    description: opts.description || `${opts.name} - a community ECHO project.`,
    developerType: 'addon_developer',
    publisher: {
      id: opts.namespace,
      name: opts.name,
      type: 'creator'
    },
    projectClass: PROJECT_CLASS[opts.type],
    namespace: opts.namespace,
    target: {
      experiences: [opts.target],
      modules: d.modules
    },
    runtime: {
      supports: opts.runtimes,
      nativeReadiness: opts.runtimes.includes('echo_native') ? 'partial' : 'none',
      minimumEchoSdk: SDK_VERSION.split('.').slice(0, 2).join('.') + '.0'
    },
    permissions: d.permissions,
    dependencies: {
      required,
      optional: opts.type === 'mission_pack' ? ['echo:holomap', 'echo:index'].filter((id) => !required.includes(id)) : []
    },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'creator_supported' },
    tags: ['echo', 'addon']
  }
}

function packageDependencyAliases(manifest: AddonManifest, catalog: EchoModuleRecord[]): string[] {
  const out = new Map<string, string>()
  for (const mod of getModuleDependencyClosure([...manifest.dependencies.required, ...manifest.target.modules], catalog)) {
    out.set(mod.id, preferredModuleAlias(mod))
  }
  for (const id of manifest.dependencies.required) {
    const normalized = normalizeModuleId(id, catalog)
    if (!out.has(normalized)) out.set(normalized, id)
  }
  return Array.from(out.values())
}

export function buildAddonPackageManifest(
  manifest: AddonManifest,
  catalog: EchoModuleRecord[] = ECHO_MODULE_CATALOG
): AddonPackageManifest {
  const addonId = manifest.id.includes(':') ? manifest.id.split(':')[1] : manifest.id
  const targets = manifest.runtime.supports.map((runtime) => (runtime === 'echo_native' ? 'native' : runtime))
  return {
    schemaVersion: 'echo.addon.package.v1',
    id: addonId,
    version: manifest.version,
    publisher: {
      githubOwner: manifest.publisher.id,
      githubRepo: `${addonId}-addon`
    },
    targets,
    dependencies: packageDependencyAliases(manifest, catalog).map((id) => ({ id, kind: 'module' as const, version: '*' })),
    artifacts: {
      ...(targets.includes('native') ? { native: `${addonId}-${manifest.version}.echo-addon` } : {}),
      ...(targets.includes('neoforge') ? { neoforge: `${addonId}-${manifest.version}-neoforge.jar` } : {}),
      ...(targets.includes('standalone') ? { standalone: `${addonId}-${manifest.version}-standalone.jar` } : {}),
      sources: `${addonId}-${manifest.version}-sources.jar`
    }
  }
}

function shouldIncludePreviewProfile(options: CreateAddonOptions['options']): boolean {
  const current = options.includePreviewProfile as boolean | undefined
  return current ?? options.includeSandbox === true
}

// Returns a map of relative file path -> string content for a new project.
export function buildProjectFiles(opts: CreateAddonOptions, manifest: AddonManifest): Record<string, string> {
  const files: Record<string, string> = {}
  const ns = opts.namespace
  const id = opts.addonId

  files['echo.mod.json'] = JSON.stringify(manifest, null, 2)
  files['META-INF/echo-addon-package.json'] = JSON.stringify(buildAddonPackageManifest(manifest), null, 2)
  files['validation.policy.json'] = JSON.stringify(
    { schemaVersion: 'echo.studio.validation.policy.v1', policyTarget: 'community', minimumScore: 70, ignoreWarnings: [] },
    null,
    2
  )
  files['README.md'] = `# ${opts.name}\n\n${manifest.description}\n\n- **ID:** \`${manifest.id}\`\n- **Target:** ${opts.target}\n- **Type:** ${opts.type}\n\nBuilt with ECHO Studio.\n`
  files['CHANGELOG.md'] = `# Changelog\n\n## 0.1.0\n- Initial project created with ECHO Studio.\n`
  files['LICENSE'] = `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${opts.namespace}\n`

  // Keep folder structure with .gitkeep so empty dirs persist.
  for (const dir of ['assets/icons', 'assets/textures', 'assets/models', 'assets/sounds', 'content/items', 'content/blocks', 'content/entities', 'content/loot', 'content/dialogue', 'docs']) {
    files[`${dir}/.gitkeep`] = ''
  }

  if (opts.options.includeExample) {
    if (opts.type === 'mission_pack') {
      files[`missions/${id}_01.json`] = JSON.stringify(
        {
          id: `${ns}:${id}_01`,
          title: 'Find the Signal Beacon',
          description: 'Locate the lost signal beacon in the ashfields.',
          objective: { type: 'visit_location', target: `${ns}:beacon_site` },
          completion: 'reach_target',
          rewards: opts.options.includeRewards ? [{ item: `${ns}:relay_frame`, count: 1 }] : [],
          repeatable: false,
          hidden: false,
          timed: false
        },
        null,
        2
      )
    }
    if (opts.type === 'recipe_pack') {
      files[`recipes/${id}_alloy.json`] = JSON.stringify(
        {
          id: `${ns}:${id}_alloy`,
          type: 'machine_recipe',
          machine: `${ns}:grinder`,
          inputs: [{ item: `${ns}:rubble`, count: 4 }],
          output: { item: `${ns}:ash_alloy`, count: 1 },
          time: 200,
          energy: 100
        },
        null,
        2
      )
    }
  }

  if (opts.options.includeHoloMap) {
    files[`holomap/${id}_markers.json`] = JSON.stringify(
      {
        layer: `${ns}:${id}_layer`,
        markers: [
          {
            id: `${ns}:beacon_marker`,
            title: 'Signal Beacon',
            icon: 'beacon',
            position: { x: 128, z: -340 },
            visibleByDefault: true,
            linkedMission: `${ns}:${id}_01`
          }
        ]
      },
      null,
      2
    )
  }

  if (opts.options.includeIndex) {
    files[`index/${id}_entries.json`] = JSON.stringify(
      {
        entries: [
          {
            id: `${ns}:ash_alloy`,
            title: 'Ash Alloy',
            category: 'materials',
            description: 'A durable alloy refined from ashfield rubble.'
          }
        ]
      },
      null,
      2
    )
  }

  if (opts.options.includeLocalization) {
    files['lang/en_us.json'] = JSON.stringify(
      {
        [`addon.${ns}.${id}.name`]: opts.name,
        [`item.${ns}.ash_alloy`]: 'Ash Alloy'
      },
      null,
      2
    )
  }

  if (shouldIncludePreviewProfile(opts.options)) {
    files['preview/compatibility-profile.json'] = JSON.stringify(
      {
        profile: `${opts.target}_compatibility`,
        loadOnly: [manifest.id],
        debugOverlay: true,
        fakePlayer: true,
        testInventory: true
      },
      null,
      2
    )
  }

  return files
}
