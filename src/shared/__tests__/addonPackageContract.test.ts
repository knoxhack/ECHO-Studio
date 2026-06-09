import { describe, expect, it } from 'vitest'
import { validateAddonPackageManifest } from '../addonPackageContract'

describe('validateAddonPackageManifest', () => {
  it('accepts a package manifest whose artifacts were built', () => {
    const result = validateAddonPackageManifest({
      schemaVersion: 'echo.addon.package.v1',
      id: 'weather_pack',
      version: '1.0.0',
      publisher: { githubOwner: 'teamnova', githubRepo: 'weather-pack-addon' },
      targets: ['native', 'neoforge'],
      dependencies: [{ id: 'echo:core', version: '*' }],
      artifacts: {
        native: 'weather_pack-1.0.0.echo-addon',
        neoforge: 'weather_pack-1.0.0-neoforge.jar',
        sources: 'weather_pack-1.0.0-sources.jar'
      }
    }, [
      'weather_pack-1.0.0.echo-addon',
      'weather_pack-1.0.0-neoforge.jar',
      'weather_pack-1.0.0-sources.jar'
    ])

    expect(result).toEqual({ ok: true, issues: [] })
  })

  it('rejects invalid schema version and artifact filenames', () => {
    const result = validateAddonPackageManifest({
      schemaVersion: 'wrong' as never,
      id: 'WeatherPack',
      version: '',
      publisher: { githubOwner: '', githubRepo: '' },
      targets: ['native'],
      dependencies: [{ id: '', version: '' }],
      artifacts: {
        native: '../escape.echo-addon'
      }
    }, [])

    expect(result.ok).toBe(false)
    expect(result.issues.join('\n')).toContain('schemaVersion must be echo.addon.package.v1')
    expect(result.issues.join('\n')).toContain('id must match')
    expect(result.issues.join('\n')).toContain('native artifact has invalid filename')
  })

  it('requires a target-specific artifact for every declared target', () => {
    const result = validateAddonPackageManifest({
      schemaVersion: 'echo.addon.package.v1',
      id: 'weather_pack',
      version: '1.0.0',
      publisher: { githubOwner: 'teamnova', githubRepo: 'weather-pack-addon' },
      targets: ['standalone'],
      dependencies: [],
      artifacts: {
        sources: 'weather_pack-1.0.0-sources.jar'
      }
    }, ['weather_pack-1.0.0-sources.jar'])

    expect(result.ok).toBe(false)
    expect(result.issues).toContain('Missing standalone artifact for target standalone.')
  })
})
