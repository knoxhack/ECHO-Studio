import { describe, it, expect } from 'vitest'
import { idToFileName, emptyContent, CONTENT_FOLDER } from '../content/paths'

describe('idToFileName', () => {
  it('converts a namespaced id to a safe filename', () => {
    expect(idToFileName('teamnova:find_beacon')).toBe('find_beacon.json')
  })

  it('sanitizes unsafe characters', () => {
    expect(idToFileName('teamnova:find@beacon!')).toBe('find_beacon_.json')
  })

  it('handles ids without namespace', () => {
    expect(idToFileName('simple')).toBe('simple.json')
  })
})

describe('emptyContent', () => {
  it('generates a mission with the correct namespace', () => {
    const m = emptyContent('mission', 'nova') as any
    expect(m.id).toMatch(/^nova:/)
    expect(m.title).toBe('New Mission')
    expect(m.rewards).toEqual([])
  })

  it('generates a recipe with the correct namespace', () => {
    const r = emptyContent('recipe', 'nova') as any
    expect(r.id).toMatch(/^nova:/)
    expect(r.type).toBe('machine_recipe')
    expect(r.inputs).toEqual([])
  })

  it('generates a screen with xml', () => {
    const s = emptyContent('screen', 'nova') as any
    expect(s.xml).toContain('<Screen>')
  })

  it('generates an item with maxStack', () => {
    const i = emptyContent('item', 'nova') as any
    expect(i.name).toBe('New Item')
    expect(i.maxStack).toBe(64)
  })

  it('generates a loot table with rolls', () => {
    const l = emptyContent('loot', 'nova') as any
    expect(l.rolls).toBe(1)
    expect(l.entries).toEqual([])
  })

  it('generates a dialogue with npc', () => {
    const d = emptyContent('dialogue', 'nova') as any
    expect(d.npc).toBe('npc')
    expect(d.lines).toEqual([])
  })
})

describe('CONTENT_FOLDER', () => {
  it('maps content types to folders', () => {
    expect(CONTENT_FOLDER.mission).toBe('missions')
    expect(CONTENT_FOLDER.recipe).toBe('recipes')
    expect(CONTENT_FOLDER.item).toBe('content/items')
    expect(CONTENT_FOLDER.loot).toBe('content/loot')
    expect(CONTENT_FOLDER.dialogue).toBe('content/dialogue')
  })
})
