import type { AddonType, Runtime, TargetExperience } from './types'

// The reserved namespace. Community addons must NOT use this.
export const RESERVED_NAMESPACE = 'echo'

export const SDK_VERSION = '1.4.3'

export const ADDON_TYPE_LABELS: Record<AddonType, string> = {
  gameplay_addon: 'Gameplay Addon',
  mission_pack: 'Mission Pack',
  recipe_pack: 'Recipe Pack',
  ui_addon: 'ScreenCore UI Addon',
  holomap_layer: 'HoloMap Layer Pack',
  index_pack: 'Index Data Pack',
  world_pack: 'World / Region Pack',
  theme_pack: 'Theme Pack',
  asset_pack: 'Asset Pack',
  server_module: 'Server Module',
  community_experience: 'Community Experience'
}

export const TARGET_LABELS: Record<TargetExperience, string> = {
  ashfall: 'Ashfall',
  echo_prime: 'ECHO Prime',
  arcana_division: 'Arcana Division',
  custom: 'Custom ECHO Experience',
  generic: 'Generic ECHO Platform'
}

export const RUNTIME_LABELS: Record<Runtime, string> = {
  neoforge: 'NeoForge',
  echo_native: 'ECHO Native',
  standalone: 'Standalone ECHO Runtime'
}

// Permissions that are safe for community addons.
export const ALLOWED_PERMISSIONS = [
  'addon_storage.read',
  'addon_storage.write',
  'network.safe_request',
  'screen.custom_ui',
  'mission.register',
  'recipe.register',
  'holomap.layers',
  'index.entries'
] as const

// Permissions reserved for ECHO Developers - blocked for community addons.
export const BLOCKED_PERMISSIONS: Record<string, string> = {
  'file_system.write_global': 'addon_storage.write',
  'runtime.internal': 'addon_storage.write',
  'launcher.catalog.write': 'addon_storage.write',
  'validation.policy.modify': 'addon_storage.write',
  // Legacy PackOS permission name. Kept blocked so imported older manifests are still repaired safely.
  'packos.policy.modify': 'addon_storage.write',
  'official_signature.use': 'addon_storage.write'
}

// Known public ECHO modules creators can depend on.
export const SDK_MODULES = [
  'echo:core',
  'echo:net_core',
  'echo:mission_core',
  'echo:recipe_core',
  'echo:screen_core',
  'echo:holomap',
  'echo:index'
] as const

export const ALL_PERMISSIONS = [
  ...ALLOWED_PERMISSIONS,
  ...Object.keys(BLOCKED_PERMISSIONS)
]
