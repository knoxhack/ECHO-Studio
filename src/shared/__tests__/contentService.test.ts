import { describe, it, expect } from 'vitest'
import { unwrap } from '../../main/contentService'


describe('unwrap', () => {
  it('returns array as-is', () => {
    const raw = [{ id: 'a' }, { id: 'b' }]
    expect(unwrap('mission', raw)).toEqual(raw)
  })

  it('unwraps index entries', () => {
    const raw = { entries: [{ id: 'a' }, { id: 'b' }] }
    expect(unwrap('index', raw)).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('unwraps holomap markers into a layer', () => {
    const raw = { layer: 'test_layer', markers: [{ id: 'm1' }] }
    const result = unwrap('holomap', raw) as any[]
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('test_layer')
    expect(result[0].markers).toEqual([{ id: 'm1' }])
  })

  it('wraps single object in array', () => {
    const raw = { id: 'single' }
    expect(unwrap('mission', raw)).toEqual([{ id: 'single' }])
  })
})
