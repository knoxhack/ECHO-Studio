import { describe, it, expect } from 'vitest'
import { escapeArg } from '../../main/gitService'

describe('escapeArg', () => {
  it('passes through safe characters', () => {
    expect(escapeArg('hello')).toBe('hello')
    expect(escapeArg('path/to/file.txt')).toBe('path/to/file.txt')
  })

  it('quotes arguments with spaces', () => {
    expect(escapeArg('hello world')).toBe('"hello world"')
  })

  it('escapes double quotes', () => {
    expect(escapeArg('say "hello"')).toBe('"say \\"hello\\""')
  })
})
