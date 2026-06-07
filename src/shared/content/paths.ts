import type { ContentType, ContentMap } from './schemas'

// Folder each content type is stored in, relative to the project root.
export const CONTENT_FOLDER: Record<ContentType, string> = {
  mission: 'missions',
  recipe: 'recipes',
  holomap: 'holomap',
  index: 'index',
  screen: 'screens',
  item: 'content/items',
  loot: 'content/loot',
  dialogue: 'content/dialogue'
}

export const CONTENT_LABEL: Record<ContentType, string> = {
  mission: 'Missions',
  recipe: 'Recipes',
  holomap: 'HoloMap',
  index: 'Index',
  screen: 'Screens',
  item: 'Items',
  loot: 'Loot',
  dialogue: 'Dialogue'
}

// Convert a namespaced id (teamnova:find_beacon) to a safe filename.
export function idToFileName(id: string): string {
  const local = id.includes(':') ? id.split(':')[1] : id
  return `${local.replace(/[^a-z0-9_-]/gi, '_')}.json`
}

// Build a default empty content item of the given type.
export function emptyContent<T extends ContentType>(type: T, namespace: string): ContentMap[T] {
  const ns = namespace || 'teamnova'
  const stamp = Date.now().toString(36)
  switch (type) {
    case 'mission':
      return {
        id: `${ns}:mission_${stamp}`,
        title: 'New Mission',
        objective: { type: 'visit_location' },
        rewards: []
      } as unknown as ContentMap[T]
    case 'recipe':
      return {
        id: `${ns}:recipe_${stamp}`,
        type: 'machine_recipe',
        inputs: [],
        output: { item: `${ns}:output`, count: 1 }
      } as unknown as ContentMap[T]
    case 'holomap':
      return {
        id: `${ns}:layer_${stamp}`,
        title: 'New Layer',
        type: 'poi',
        markers: []
      } as unknown as ContentMap[T]
    case 'index':
      return {
        id: `${ns}:entry_${stamp}`,
        title: 'New Entry',
        type: 'item',
        category: 'general',
        description: ''
      } as unknown as ContentMap[T]
    case 'screen':
      return {
        id: `${ns}:screen_${stamp}`,
        title: 'New Screen',
        xml: '<Screen>\n  <Panel></Panel>\n</Screen>'
      } as unknown as ContentMap[T]
    case 'item':
      return { id: `${ns}:item_${stamp}`, name: 'New Item', maxStack: 64 } as unknown as ContentMap[T]
    case 'loot':
      return { id: `${ns}:loot_${stamp}`, rolls: 1, entries: [] } as unknown as ContentMap[T]
    case 'dialogue':
      return { id: `${ns}:dialogue_${stamp}`, npc: 'npc', lines: [] } as unknown as ContentMap[T]
    default:
      return { id: `${ns}:content_${stamp}` } as unknown as ContentMap[T]
  }
}
