import type { AddonType, CreateAddonOptions, CreateAddonScaffoldOptions, Runtime, TargetExperience } from './types'

export type TemplateCategory =
  | 'Starter'
  | 'Gameplay'
  | 'UI'
  | 'World'
  | 'Server'
  | 'Advanced'

export interface TemplateContext {
  namespace: string
  addonId: string
  name: string
}

export interface TemplateDef {
  id: string
  name: string
  category: TemplateCategory
  description: string
  type: AddonType
  target: TargetExperience
  runtimes: Runtime[]
  options: CreateAddonScaffoldOptions
  // Extra files (relative path -> content), layered on top of the base scaffold.
  extraFiles?: (ctx: TemplateContext) => Record<string, string>
}

export interface TemplateInstantiationOptions {
  workspaceDir: string
  namespace: string
  addonId: string
  name: string
}

const ALL_OPTS = {
  includeExample: true,
  includeHoloMap: true,
  includeIndex: true,
  includeRewards: true,
  includeLocalization: true,
  includePreviewProfile: true
}
const MIN_OPTS = {
  includeExample: false,
  includeHoloMap: false,
  includeIndex: false,
  includeRewards: false,
  includeLocalization: false,
  includePreviewProfile: true
}

function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

export const TEMPLATES: TemplateDef[] = [
  // ---------------- Starter ----------------
  {
    id: 'basic_addon',
    name: 'Basic Addon',
    category: 'Starter',
    description: 'A simple ECHO-compatible addon structure.',
    type: 'gameplay_addon',
    target: 'generic',
    runtimes: ['neoforge', 'echo_native'],
    options: MIN_OPTS
  },
  {
    id: 'example_item',
    name: 'Example Item Addon',
    category: 'Starter',
    description: 'Adds one custom item and an Index entry.',
    type: 'gameplay_addon',
    target: 'generic',
    runtimes: ['neoforge'],
    options: { ...MIN_OPTS, includeIndex: true, includeLocalization: true },
    extraFiles: ({ namespace, addonId }) => ({
      [`content/items/${addonId}_item.json`]: json({
        id: `${namespace}:${addonId}_item`,
        name: 'Example Item',
        texture: `${namespace}:${addonId}_item`,
        maxStack: 64
      }),
      [`index/${addonId}_item.json`]: json({
        entries: [
          { id: `${namespace}:${addonId}_item`, title: 'Example Item', type: 'item', category: 'materials', description: 'An example item created from a template.' }
        ]
      })
    })
  },
  {
    id: 'example_mission',
    name: 'Example Mission Addon',
    category: 'Starter',
    description: 'Adds one mission route and reward.',
    type: 'mission_pack',
    target: 'ashfall',
    runtimes: ['neoforge', 'echo_native'],
    options: ALL_OPTS
  },
  {
    id: 'example_recipe',
    name: 'Example Recipe Addon',
    category: 'Starter',
    description: 'Adds one recipe and usage entry.',
    type: 'recipe_pack',
    target: 'generic',
    runtimes: ['neoforge'],
    options: { ...MIN_OPTS, includeExample: true, includeIndex: true }
  },
  {
    id: 'example_theme',
    name: 'Example Theme Addon',
    category: 'Starter',
    description: 'Adds a ScreenCore theme pack.',
    type: 'theme_pack',
    target: 'generic',
    runtimes: ['echo_native'],
    options: MIN_OPTS,
    extraFiles: ({ namespace, addonId }) => ({
      [`screens/${addonId}_theme.json`]: json({
        id: `${namespace}:${addonId}_theme`,
        title: 'Theme',
        tokens: { 'color.bg': '#0a0e14', 'color.accent': '#2ee6c8', 'radius.panel': 10 }
      })
    })
  },
  // ---------------- Gameplay ----------------
  {
    id: 'item_pack',
    name: 'Item Pack',
    category: 'Gameplay',
    description: 'A set of custom items with Index entries.',
    type: 'gameplay_addon',
    target: 'generic',
    runtimes: ['neoforge', 'echo_native'],
    options: { ...MIN_OPTS, includeIndex: true, includeLocalization: true },
    extraFiles: ({ namespace }) => ({
      'content/items/scrap.json': json({ id: `${namespace}:scrap`, name: 'Scrap', maxStack: 64 }),
      'content/items/wire.json': json({ id: `${namespace}:wire`, name: 'Wire', maxStack: 64 })
    })
  },
  {
    id: 'machine_recipe_pack',
    name: 'Machine Recipe Pack',
    category: 'Gameplay',
    description: 'Recipes for ECHO machines.',
    type: 'recipe_pack',
    target: 'generic',
    runtimes: ['neoforge'],
    options: { ...MIN_OPTS, includeExample: true, includeIndex: true }
  },
  {
    id: 'loot_pack',
    name: 'Loot Pack',
    category: 'Gameplay',
    description: 'Custom loot tables.',
    type: 'world_pack',
    target: 'ashfall',
    runtimes: ['neoforge'],
    options: MIN_OPTS,
    extraFiles: ({ namespace }) => ({
      'content/loot/ash_cache.json': json({ id: `${namespace}:ash_cache`, rolls: 2, entries: [{ item: `${namespace}:scrap`, weight: 5 }] })
    })
  },
  // ---------------- UI ----------------
  {
    id: 'terminal_theme',
    name: 'Terminal Theme',
    category: 'UI',
    description: 'Themed terminal colors.',
    type: 'theme_pack',
    target: 'generic',
    runtimes: ['echo_native'],
    options: MIN_OPTS
  },
  {
    id: 'mission_board_ui',
    name: 'Mission Board UI',
    category: 'UI',
    description: 'A ScreenCore mission board screen.',
    type: 'ui_addon',
    target: 'ashfall',
    runtimes: ['echo_native'],
    options: MIN_OPTS,
    extraFiles: ({ namespace }) => ({
      'screens/mission_board.json': json({
        id: `${namespace}:mission_board`,
        title: 'Mission Board',
        xml: '<Screen id="mission_board">\n  <Panel theme="ash">\n    <Title>Missions</Title>\n    <List binding="missions" />\n  </Panel>\n</Screen>'
      })
    })
  },
  // ---------------- World ----------------
  {
    id: 'region_pack',
    name: 'Region Pack',
    category: 'World',
    description: 'New regions for the world.',
    type: 'world_pack',
    target: 'ashfall',
    runtimes: ['neoforge', 'echo_native'],
    options: { ...MIN_OPTS, includeHoloMap: true }
  },
  {
    id: 'holomap_layer_pack',
    name: 'HoloMap Layer Pack',
    category: 'World',
    description: 'Custom map layers and markers.',
    type: 'holomap_layer',
    target: 'ashfall',
    runtimes: ['echo_native'],
    options: { ...MIN_OPTS, includeHoloMap: true }
  },
  // ---------------- Server ----------------
  {
    id: 'server_rules',
    name: 'Server Rules Addon',
    category: 'Server',
    description: 'Server-side rule configuration.',
    type: 'server_module',
    target: 'generic',
    runtimes: ['neoforge'],
    options: MIN_OPTS,
    extraFiles: ({ namespace }) => ({
      'server/rules.json': json({ id: `${namespace}:rules`, pvp: false, maxPlayers: 32 })
    })
  },
  {
    id: 'community_quest_pack',
    name: 'Community Quest Pack',
    category: 'Server',
    description: 'Server-wide community quests.',
    type: 'server_module',
    target: 'ashfall',
    runtimes: ['neoforge'],
    options: { ...MIN_OPTS, includeExample: true }
  },
  // ---------------- Advanced ----------------
  {
    id: 'ashfall_expansion',
    name: 'Ashfall Expansion Pack',
    category: 'Advanced',
    description: 'A large Ashfall expansion with missions, recipes, map and Index.',
    type: 'community_experience',
    target: 'ashfall',
    runtimes: ['neoforge', 'echo_native'],
    options: ALL_OPTS
  },
  {
    id: 'dialogue_pack',
    name: 'Dialogue Pack',
    category: 'Gameplay',
    description: 'NPC dialogue trees with branching conversations.',
    type: 'gameplay_addon',
    target: 'ashfall',
    runtimes: ['neoforge', 'echo_native'],
    options: { ...MIN_OPTS, includeExample: true },
    extraFiles: ({ namespace }) => ({
      'content/dialogues/greeting.json': json({
        id: `${namespace}:greeting`,
        npc: `${namespace}:merchant`,
        lines: [
          { speaker: 'npc', text: 'Welcome, traveller. The ashfields are dangerous today.' },
          { speaker: 'player', text: 'I am looking for supplies.', next: `${namespace}:supplies` }
        ]
      }),
      'content/dialogues/supplies.json': json({
        id: `${namespace}:supplies`,
        npc: `${namespace}:merchant`,
        lines: [
          { speaker: 'npc', text: 'I have rubble and wire. What do you need?' }
        ]
      })
    })
  },
  {
    id: 'native_ready',
    name: 'Native-Ready Addon',
    category: 'Advanced',
    description: 'Structured for ECHO Native lifecycle entrypoints.',
    type: 'gameplay_addon',
    target: 'echo_prime',
    runtimes: ['echo_native'],
    options: MIN_OPTS
  }
]

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function createOptionsFromTemplate(template: TemplateDef, input: TemplateInstantiationOptions): CreateAddonOptions {
  return {
    workspaceDir: input.workspaceDir,
    type: template.type,
    target: template.target,
    namespace: input.namespace,
    addonId: input.addonId,
    name: input.name,
    description: template.description,
    runtimes: template.runtimes,
    options: template.options
  }
}

export function templatesByCategory(): Record<TemplateCategory, TemplateDef[]> {
  const out = {} as Record<TemplateCategory, TemplateDef[]>
  for (const t of TEMPLATES) {
    ;(out[t.category] ??= []).push(t)
  }
  return out
}
