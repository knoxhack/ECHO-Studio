import { describe, expect, it } from 'vitest'
import { findLabel, NAV } from '../nav'

describe('renderer navigation metadata', () => {
  it('exposes assistant chat and Codex task review as separate assist tools', () => {
    const assist = NAV.find((group) => group.title === 'Assist')

    expect(assist?.items.map((item) => item.path)).toEqual(['/ai', '/codex'])
    expect(findLabel('/ai')).toBe('Assistant')
    expect(findLabel('/codex')).toBe('Codex Tasks')
  })
})
