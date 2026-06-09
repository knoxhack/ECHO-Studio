import { describe, it, expect } from 'vitest'
import { computeSandboxScore } from '../sandbox'

describe('computeSandboxScore', () => {
  it('returns 100 for a perfect run', () => {
    expect(computeSandboxScore(0, 0, 0, 0)).toBe(100)
  })

  it('deducts 10 per missing dependency', () => {
    expect(computeSandboxScore(2, 0, 0, 0)).toBe(80)
  })

  it('deducts 3 per warning', () => {
    expect(computeSandboxScore(0, 5, 0, 0)).toBe(85)
  })

  it('deducts 15 per error', () => {
    expect(computeSandboxScore(0, 0, 2, 0)).toBe(70)
  })

  it('deducts 5 per content failure', () => {
    expect(computeSandboxScore(0, 0, 0, 4)).toBe(80)
  })

  it('clamps to a minimum of 0', () => {
    expect(computeSandboxScore(100, 100, 100, 100)).toBe(0)
  })
})
