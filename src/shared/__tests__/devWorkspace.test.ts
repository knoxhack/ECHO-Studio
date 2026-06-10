import { describe, expect, it } from 'vitest'
import { recommendedDevWorkspaceMode } from '../devWorkspace'

describe('recommendedDevWorkspaceMode', () => {
  it('uses full workspace for native and standalone runtime targets', () => {
    expect(recommendedDevWorkspaceMode(['echo_native'])).toBe('full')
    expect(recommendedDevWorkspaceMode(['standalone'])).toBe('full')
    expect(recommendedDevWorkspaceMode(['neoforge', 'echo_native'])).toBe('full')
  })

  it('uses Gradle workspace for NeoForge-only targets', () => {
    expect(recommendedDevWorkspaceMode(['neoforge'])).toBe('gradle')
    expect(recommendedDevWorkspaceMode([])).toBe('gradle')
  })
})
