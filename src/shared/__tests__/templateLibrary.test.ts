import { describe, it, expect } from 'vitest'
import { createOptionsFromTemplate, templateById, templatesByCategory, TEMPLATES } from '../templateLibrary'
import { buildAddonPackageManifest, buildManifest, buildProjectFiles } from '../templates'
import { ECHO_MODULE_CATALOG, mergeModuleCatalog, moduleFromIndexEntry, resolveProjectModulePlan } from '../moduleCatalog'
import type { CreateAddonOptions } from '../types'

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

describe('createOptionsFromTemplate', () => {
  it('builds the same create options used by template previews and project creation', () => {
    const template = templateById('example_mission')!
    const options = createOptionsFromTemplate(template, {
      workspaceDir: 'C:\\workspace',
      namespace: 'teamnova',
      addonId: 'signal_route',
      name: 'Signal Route'
    })

    expect(options).toMatchObject({
      workspaceDir: 'C:\\workspace',
      type: template.type,
      target: template.target,
      namespace: 'teamnova',
      addonId: 'signal_route',
      name: 'Signal Route',
      description: template.description,
      runtimes: template.runtimes,
      options: template.options
    })
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

  it('scaffolds preview compatibility profiles instead of legacy sandbox profiles', () => {
    const opts: CreateAddonOptions = {
      workspaceDir: '',
      type: 'gameplay_addon',
      target: 'ashfall',
      namespace: 'teamnova',
      addonId: 'weather_pack',
      name: 'Weather Pack',
      description: 'A test project.',
      runtimes: ['neoforge'],
      options: {
        includeExample: false,
        includeHoloMap: false,
        includeIndex: false,
        includeRewards: false,
        includeLocalization: false,
        includePreviewProfile: true
      }
    }
    const files = buildProjectFiles(opts, buildManifest(opts))
    expect(files['preview/compatibility-profile.json']).toContain('ashfall_compatibility')
    expect(files['sandbox/test_profile.json']).toBeUndefined()
  })

  it('scaffolds manifests with the full required ECHO module closure', () => {
    const opts: CreateAddonOptions = {
      workspaceDir: '',
      type: 'mission_pack',
      target: 'ashfall',
      namespace: 'teamnova',
      addonId: 'signal_route',
      name: 'Signal Route',
      description: 'A test mission project.',
      runtimes: ['neoforge', 'echo_native'],
      options: {
        includeExample: true,
        includeHoloMap: true,
        includeIndex: true,
        includeRewards: true,
        includeLocalization: true,
        includePreviewProfile: true
      }
    }

    const manifest = buildManifest(opts)
    const plan = resolveProjectModulePlan(manifest)

    expect(plan.missingRequired).toEqual([])
    expect(plan.targetModules.map((mod) => mod.id)).toEqual(expect.arrayContaining(['echomissioncore', 'echoholomap', 'echoindex']))
    expect(plan.requiredModules.map((mod) => mod.id)).toEqual(expect.arrayContaining(['echoadaptercore', 'echocore', 'echonetcore', 'echomissioncore']))
    expect(manifest.dependencies.required).toEqual(expect.arrayContaining(['echo:adapter_core', 'echo:core', 'echo:net_core', 'echo:mission_core']))
  })

  it('scaffolds manifests against an imported local ECHO-Modules catalog', () => {
    const catalog = mergeModuleCatalog([
      moduleFromIndexEntry({
        id: 'echomissioncore',
        name: 'ECHO: MissionCore',
        channel: 'beta',
        requires: ['echocore', 'echonetcore', 'echoweathercore']
      }),
      moduleFromIndexEntry({
        id: 'echoweathercore',
        name: 'ECHO: WeatherCore',
        channel: 'beta',
        requires: ['echocore'],
        provides: ['weather.events']
      })
    ], ECHO_MODULE_CATALOG)
    const opts: CreateAddonOptions = {
      workspaceDir: '',
      type: 'mission_pack',
      target: 'ashfall',
      namespace: 'teamnova',
      addonId: 'signal_route',
      name: 'Signal Route',
      description: 'A test mission project.',
      runtimes: ['neoforge', 'echo_native'],
      options: {
        includeExample: true,
        includeHoloMap: true,
        includeIndex: true,
        includeRewards: true,
        includeLocalization: true,
        includePreviewProfile: true
      }
    }

    const manifest = buildManifest(opts, catalog)
    const plan = resolveProjectModulePlan(manifest, catalog)

    expect(manifest.dependencies.required).toContain('echo:weather_core')
    expect(plan.targetModules.map((mod) => mod.id)).not.toContain('echoweathercore')
    expect(plan.requiredModules.map((mod) => mod.id)).toContain('echoweathercore')
    expect(plan.missingRequired).toEqual([])
    expect(plan.closure.map((mod) => mod.id)).toContain('echoweathercore')
  })

  it('builds package manifests from required and target module closure only', () => {
    const opts: CreateAddonOptions = {
      workspaceDir: '',
      type: 'mission_pack',
      target: 'ashfall',
      namespace: 'teamnova',
      addonId: 'signal_route',
      name: 'Signal Route',
      description: 'A test mission project.',
      runtimes: ['neoforge'],
      options: {
        includeExample: true,
        includeHoloMap: true,
        includeIndex: true,
        includeRewards: true,
        includeLocalization: true,
        includePreviewProfile: true
      }
    }
    const manifest = buildManifest(opts)
    manifest.dependencies.optional = ['echo:theme_core']
    const pkg = buildAddonPackageManifest(manifest)
    const dependencyIds = pkg.dependencies.map((dep) => dep.id)

    expect(dependencyIds).toEqual(expect.arrayContaining([
      'echo:adapter_core',
      'echo:core',
      'echo:net_core',
      'echo:mission_core',
      'echo:holomap',
      'echo:index'
    ]))
    expect(dependencyIds).not.toContain('echo:theme_core')
  })

  it('keeps every bundled template starter module graph complete', () => {
    const incomplete = TEMPLATES.map((template) => {
      const opts: CreateAddonOptions = {
        workspaceDir: '',
        type: template.type,
        target: template.target,
        namespace: 'teamnova',
        addonId: template.id,
        name: template.name,
        description: template.description,
        runtimes: template.runtimes,
        options: template.options
      }
      const plan = resolveProjectModulePlan(buildManifest(opts))
      return {
        template: template.id,
        missing: plan.missingRequired.map((mod) => mod.id)
      }
    }).filter((result) => result.missing.length > 0)

    expect(incomplete).toEqual([])
  })

  it('keeps legacy includeSandbox callers mapped to preview profiles', () => {
    const opts = {
      workspaceDir: '',
      type: 'gameplay_addon',
      target: 'ashfall',
      namespace: 'teamnova',
      addonId: 'weather_pack',
      name: 'Weather Pack',
      description: 'A test project.',
      runtimes: ['neoforge'],
      options: {
        includeExample: false,
        includeHoloMap: false,
        includeIndex: false,
        includeRewards: false,
        includeLocalization: false,
        includeSandbox: true
      }
    } as unknown as CreateAddonOptions
    const files = buildProjectFiles(opts, buildManifest(opts))
    expect(files['preview/compatibility-profile.json']).toContain('ashfall_compatibility')
    expect(files['sandbox/test_profile.json']).toBeUndefined()
  })
})
