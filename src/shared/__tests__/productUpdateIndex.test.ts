import { describe, expect, it } from 'vitest'
import { selectIndexedProductUpdate, type ReleaseIndexProductEntry } from '../productUpdateIndex'

const sha = 'a'.repeat(64)

function productEntry(overrides: Partial<ReleaseIndexProductEntry> = {}): ReleaseIndexProductEntry {
  return {
    id: 'echo-addons-studio',
    kind: 'studio',
    version: '0.1.1',
    sourceRepo: 'knoxhack/ECHO-Studio',
    validation: 'approved',
    artifacts: {
      windowsSetup: {
        file: 'ECHO Studio-Setup-0.1.1.exe',
        url: 'https://github.com/knoxhack/ECHO-Studio/releases/download/v0.1.1/ECHO%20Studio-Setup-0.1.1.exe',
        sha256: sha,
        size: 100
      },
      windowsSetupBlockmap: {
        file: 'ECHO Studio-Setup-0.1.1.exe.blockmap',
        url: 'https://github.com/knoxhack/ECHO-Studio/releases/download/v0.1.1/ECHO%20Studio-Setup-0.1.1.exe.blockmap',
        sha256: sha,
        size: 10
      },
      latestYml: {
        file: 'latest.yml',
        url: 'https://github.com/knoxhack/ECHO-Studio/releases/download/v0.1.1/latest.yml',
        sha256: sha,
        size: 1
      }
    },
    ...overrides
  }
}

describe('selectIndexedProductUpdate', () => {
  it('selects exact indexed updater artifacts from an approved Release Index product', () => {
    const update = selectIndexedProductUpdate(productEntry(), 'echo-addons-studio')

    expect(update.feed).toEqual({ owner: 'knoxhack', repo: 'ECHO-Studio' })
    expect(update.artifacts.latestYml.name).toBe('latest.yml')
    expect(update.artifacts.installer.name).toBe('ECHO Studio-Setup-0.1.1.exe')
    expect(update.artifacts.blockmap?.name).toBe('ECHO Studio-Setup-0.1.1.exe.blockmap')
  })

  it('rejects warning product entries before updater feed selection', () => {
    expect(() => selectIndexedProductUpdate(productEntry({ validation: 'warning' }), 'echo-addons-studio')).toThrow(/is warning/)
  })

  it('requires latest.yml and installer artifacts with GitHub URLs and SHA-256 hashes', () => {
    expect(() =>
      selectIndexedProductUpdate(productEntry({
        artifacts: {
          latestYml: {
            file: 'latest.yml',
            url: 'https://github.com/knoxhack/ECHO-Studio/releases/download/v0.1.1/latest.yml',
            sha256: sha
          }
        }
      }), 'echo-addons-studio')
    ).toThrow(/Windows installer/)

    expect(() =>
      selectIndexedProductUpdate(productEntry({
        artifacts: {
          windowsSetup: {
            file: 'ECHO Studio-Setup-0.1.1.exe',
            url: 'https://example.com/ECHO%20Studio-Setup-0.1.1.exe',
            sha256: 'not-a-sha'
          },
          latestYml: {
            file: 'latest.yml',
            url: 'https://github.com/knoxhack/ECHO-Studio/releases/download/v0.1.1/latest.yml',
            sha256: sha
          }
        }
      }), 'echo-addons-studio')
    ).toThrow(/Windows installer/)
  })
})
