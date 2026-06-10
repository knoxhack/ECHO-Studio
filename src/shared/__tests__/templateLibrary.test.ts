import { describe, it, expect } from 'vitest'
import { templateById, templatesByCategory, TEMPLATES } from '../templateLibrary'
import { buildManifest, buildProjectFiles } from '../templates'
import { resolveProjectModulePlan } from '../moduleCatalog'
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
    expect(manifest.dependencies.required).toEqual(expect.arrayContaining(['echo:adapter_core', 'echo:core', 'echo:net_core', 'echo:mission_core']))
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
