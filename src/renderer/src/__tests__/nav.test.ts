import { describe, expect, it } from 'vitest'
import { findLabel, NAV } from '../nav'

describe('renderer navigation metadata', () => {
  it('surfaces the main local-first workflow in sidebar order', () => {
    expect(NAV.map((group) => group.title)).toEqual([
      'Start',
      'Build',
      'Author',
      'Ship',
      'Assist',
      'System'
    ])

    expect(NAV.find((group) => group.title === 'Start')?.items.map((item) => item.path)).toEqual([
      '/',
      '/projects',
      '/create',
      '/templates',
      '/experience'
    ])
    expect(NAV.find((group) => group.title === 'Build')?.items.map((item) => item.path)).toEqual([
      '/modules',
      '/dev-workspace',
      '/content',
      '/assets'
    ])
    expect(NAV.find((group) => group.title === 'Ship')?.items.map((item) => item.path)).toEqual([
      '/preview',
      '/validation',
      '/release',
      '/catalog'
    ])
  })

  it('exposes assistant chat and Codex task review as separate assist tools', () => {
    const assist = NAV.find((group) => group.title === 'Assist')

    expect(assist?.items.map((item) => item.path)).toEqual(['/ai', '/codex'])
    expect(findLabel('/ai')).toBe('Assistant')
    expect(findLabel('/codex')).toBe('Codex Tasks')
  })

  it('keeps legacy routes labeled with current Studio surface names', () => {
    expect(findLabel('/manifest-editor')).toBe('Manifest JSON')
    expect(findLabel('/advanced')).toBe('Content Builder')
    expect(findLabel('/submit')).toBe('Release')
    expect(findLabel('/releases')).toBe('Release')
    expect(findLabel('/catalog')).toBe('Catalog')
  })
})
