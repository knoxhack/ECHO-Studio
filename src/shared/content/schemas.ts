// Content schemas for project content stored as JSON files on disk.
// Each content item has a namespaced `id` and lives in a type-specific folder.

export type ContentType =
  | 'mission'
  | 'recipe'
  | 'holomap'
  | 'index'
  | 'screen'
  | 'item'
  | 'loot'
  | 'dialogue'

export interface MissionReward {
  item: string
  count: number
}

export interface Mission {
  id: string
  title: string
  description?: string
  objective: { type: string; target?: string }
  completion?: string
  rewards: MissionReward[]
  unlockAfter?: string // mission id this depends on
  failure?: string
  repeatable?: boolean
  hidden?: boolean
  timed?: boolean
  holomapMarker?: string // marker id
  indexEntry?: string // index entry id
}

export interface RecipeInput {
  item: string
  count: number
}

export interface Recipe {
  id: string
  type: string
  machine?: string
  inputs: RecipeInput[]
  output: { item: string; count: number }
  time?: number
  energy?: number
  unlock?: string
  indexEntry?: string
}

export interface HoloMapMarker {
  id: string
  title: string
  description?: string
  icon: string
  x: number
  z: number
  visibleByDefault?: boolean
  unlock?: string
  linkedMission?: string
  linkedIndex?: string
}

export interface HoloMapLayer {
  id: string
  title: string
  type: string
  markers: HoloMapMarker[]
}

export interface IndexEntry {
  id: string
  title: string
  type: string
  category: string
  description: string
  icon?: string
  relatedRecipes?: string[]
  relatedMissions?: string[]
  relatedMarkers?: string[]
  tags?: string[]
}

export interface Screen {
  id: string
  title: string
  theme?: string
  xml: string
  bindings?: string[]
}

export interface Item {
  id: string
  name: string
  texture?: string
  model?: string
  maxStack?: number
}

export interface LootTable {
  id: string
  rolls: number
  entries: { item: string; weight: number }[]
}

export interface Dialogue {
  id: string
  npc: string
  lines: { speaker: string; text: string; next?: string }[]
}

// A discriminated lookup for the editors. Each content item is `{ id, ... }`.
export interface ContentMap {
  mission: Mission
  recipe: Recipe
  holomap: HoloMapLayer
  index: IndexEntry
  screen: Screen
  item: Item
  loot: LootTable
  dialogue: Dialogue
}

// Generic content record as read from disk (the parsed JSON + its file path).
export interface ContentRecord<T = unknown> {
  id: string
  fileName: string
  path: string
  data: T
}
