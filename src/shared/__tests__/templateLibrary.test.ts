import { describe, it, expect } from 'vitest'
import { templateById, templatesByCategory, TEMPLATES } from '../templateLibrary'

describe('templateById', () => {
  it('returns a known template', () => {
    const t = templateById('basic_addon')
    expect(t).toBeDefined()
    expect(t?.name).toBe('Basic Addon')
  })

  it('returns undefined for unknown id', () => {
    expect(templateById('not_real')).toBeUndefined()
  })
})

describe('templatesByCategory', () => {
  it('groups templates by category', () => {
    const groups = templatesByCategory()
    expect(Object.keys(groups).length).toBeGreaterThan(0)
    expect(groups['Starter'].length).toBeGreaterThan(0)
  })

  it('includes the new dialogue template', () => {
    const groups = templatesByCategory()
    const all = Object.values(groups).flat()
    expect(all.some((t) => t.id === 'dialogue_pack')).toBe(true)
  })
})

describe('TEMPLATES', () => {
  it('has unique ids', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
