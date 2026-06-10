import { describe, expect, it } from 'vitest'
import { buildUnifiedTextDiff, jsonDocument, validationSnapshot } from '../codexTasks'

describe('codex task helpers', () => {
  it('creates JSON documents with a stable trailing newline', () => {
    expect(jsonDocument({ id: 'teamnova:test' })).toBe('{\n  "id": "teamnova:test"\n}\n')
  })

  it('builds readable text diffs for reviewable proposals', () => {
    const diff = buildUnifiedTextDiff('echo.mod.json', 'one\ntwo\n', 'one\nthree\n')
    expect(diff).toContain('--- a/echo.mod.json')
    expect(diff).toContain('+++ b/echo.mod.json')
    expect(diff).toContain('-two')
    expect(diff).toContain('+three')
  })

  it('summarizes validation counts for Codex task impact badges', () => {
    const snapshot = validationSnapshot({
      counts: { BLOCKER: 1, ERROR: 2, WARNING: 3, SUGGESTION: 4 },
      publishingReady: false
    })
    expect(snapshot).toEqual({
      blockers: 1,
      errors: 2,
      warnings: 3,
      suggestions: 4,
      publishingReady: false
    })
  })
})
