import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import type { AddonManifest } from '../types'

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir()
  }
}))

function manifest(): AddonManifest {
  return {
    schemaVersion: 1,
    id: 'teamnova:weather_pack',
    name: 'Weather Pack',
    version: '1.0.0',
    description: 'A test addon package for Codex task repairs.',
    developerType: 'addon_developer',
    publisher: { id: 'teamnova', name: 'Team Nova', type: 'team' },
    projectClass: 'gameplay_addon',
    namespace: 'teamnova',
    target: { experiences: ['ashfall'], modules: [] },
    runtime: { supports: ['neoforge'], nativeReadiness: 'none', minimumEchoSdk: '1.4.0' },
    permissions: ['mission.register'],
    dependencies: { required: ['echo:core'], optional: [] },
    trust: { level: 'community', signed: false, verified: false },
    support: { tier: 'community', issues: 'https://example.com/issues' },
    tags: ['test']
  }
}

async function withProject(run: (project: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-codex-service-'))
  const previousModulesDir = process.env.ECHO_MODULES_DIR
  try {
    const modulesRoot = path.join(root, 'ECHO-Modules')
    await fs.mkdir(path.join(modulesRoot, 'metadata', 'modules'), { recursive: true })
    await fs.writeFile(path.join(modulesRoot, 'metadata', 'modules', 'index.json'), JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-06-10T00:00:00.000Z',
      modules: []
    }, null, 2), 'utf8')
    process.env.ECHO_MODULES_DIR = modulesRoot

    const project = path.join(root, 'project')
    await fs.mkdir(path.join(project, 'missions'), { recursive: true })
    await fs.mkdir(path.join(project, 'lang'), { recursive: true })
    await fs.writeFile(path.join(project, 'echo.mod.json'), JSON.stringify(manifest(), null, 2), 'utf8')
    await fs.writeFile(path.join(project, 'missions', 'first_contact.json'), JSON.stringify({
      id: 'teamnova:first_contact',
      title: 'First Contact',
      objective: { type: 'visit_location', target: 'teamnova:beacon' },
      rewards: []
    }, null, 2), 'utf8')
    await fs.writeFile(path.join(project, 'lang', 'en_us.json'), JSON.stringify({
      'addon.teamnova.weather_pack.name': 'Weather Pack'
    }, null, 2), 'utf8')

    await run(project)
  } finally {
    if (previousModulesDir === undefined) delete process.env.ECHO_MODULES_DIR
    else process.env.ECHO_MODULES_DIR = previousModulesDir
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('codex task service', () => {
  it('proposes and applies missing mission localization keys', async () => {
    await withProject(async (project) => {
      const { applyCodexTask, listCodexTasks } = await import('../../main/codexTaskService')

      const tasks = await listCodexTasks(project)
      const task = tasks.find((item) => item.id === 'content:mission-localization')

      expect(task).toBeDefined()
      expect(task?.kind).toBe('localization_fix')
      expect(task?.lane).toBe('waiting_review')
      expect(task?.fileChanges[0].path).toBe('lang/en_us.json')
      expect(task?.fileChanges[0].diff).toContain('+  "mission.teamnova.first_contact": "First Contact"')
      expect(task?.validationAfter?.suggestions).toBeLessThan(task?.validationBefore?.suggestions ?? 999)

      const result = await applyCodexTask(project, 'content:mission-localization')
      const lang = JSON.parse(await fs.readFile(path.join(project, 'lang', 'en_us.json'), 'utf8'))
      const afterTasks = await listCodexTasks(project)

      expect(result.filesChanged).toEqual(['lang/en_us.json'])
      expect(lang['mission.teamnova.first_contact']).toBe('First Contact')
      expect(afterTasks.some((item) => item.id === 'content:mission-localization')).toBe(false)
    })
  })

  it('proposes and applies starter mission rewards', async () => {
    await withProject(async (project) => {
      const { applyCodexTask, listCodexTasks } = await import('../../main/codexTaskService')

      const tasks = await listCodexTasks(project)
      const task = tasks.find((item) => item.id === 'content:mission-rewards')

      expect(task).toBeDefined()
      expect(task?.kind).toBe('mission_reward_fix')
      expect(task?.lane).toBe('waiting_review')
      expect(task?.fileChanges[0].path).toBe('missions/first_contact.json')
      expect(task?.fileChanges[0].diff).toContain('+    {')
      expect(task?.fileChanges[0].diff).toContain('+      "item": "teamnova:reward",')
      expect(task?.validationAfter?.warnings).toBeLessThan(task?.validationBefore?.warnings ?? 999)

      const result = await applyCodexTask(project, 'content:mission-rewards')
      const mission = JSON.parse(await fs.readFile(path.join(project, 'missions', 'first_contact.json'), 'utf8'))
      const afterTasks = await listCodexTasks(project)

      expect(result.filesChanged).toEqual(['missions/first_contact.json'])
      expect(mission.rewards).toEqual([{ item: 'teamnova:reward', count: 1 }])
      expect(afterTasks.some((item) => item.id === 'content:mission-rewards')).toBe(false)
    })
  })

  it('proposes and applies missing Index entries for missions and recipe outputs', async () => {
    await withProject(async (project) => {
      const missionPath = path.join(project, 'missions', 'first_contact.json')
      const mission = JSON.parse(await fs.readFile(missionPath, 'utf8'))
      mission.description = 'Locate the weather beacon and report home.'
      mission.indexEntry = 'teamnova:first_contact_entry'
      await fs.writeFile(missionPath, JSON.stringify(mission, null, 2), 'utf8')

      await fs.mkdir(path.join(project, 'recipes'), { recursive: true })
      await fs.writeFile(path.join(project, 'recipes', 'weather_core.json'), JSON.stringify({
        id: 'teamnova:weather_core',
        type: 'crafting',
        inputs: [{ item: 'teamnova:beacon_fragment', count: 3 }],
        output: { item: 'teamnova:weather_core', count: 1 },
        indexEntry: 'teamnova:weather_core_entry'
      }, null, 2), 'utf8')

      const { applyCodexTask, listCodexTasks } = await import('../../main/codexTaskService')

      const tasks = await listCodexTasks(project)
      const task = tasks.find((item) => item.id === 'content:index-entries')

      expect(task).toBeDefined()
      expect(task?.kind).toBe('index_entry_fix')
      expect(task?.lane).toBe('waiting_review')
      expect(task?.fileChanges.map((change) => change.path)).toEqual([
        'index/first_contact_entry.json',
        'index/weather_core_entry.json'
      ])
      expect(task?.fileChanges[0].diff).toContain('+  "relatedMissions": [')
      expect(task?.fileChanges[1].diff).toContain('+  "relatedRecipes": [')
      expect(task?.validationAfter?.suggestions).toBeLessThan(task?.validationBefore?.suggestions ?? 999)

      const result = await applyCodexTask(project, 'content:index-entries')
      const missionEntry = JSON.parse(await fs.readFile(path.join(project, 'index', 'first_contact_entry.json'), 'utf8'))
      const recipeEntry = JSON.parse(await fs.readFile(path.join(project, 'index', 'weather_core_entry.json'), 'utf8'))
      const afterTasks = await listCodexTasks(project)

      expect(result.filesChanged).toEqual([
        'index/first_contact_entry.json',
        'index/weather_core_entry.json'
      ])
      expect(missionEntry).toMatchObject({
        id: 'teamnova:first_contact_entry',
        type: 'mission',
        category: 'missions',
        relatedMissions: ['teamnova:first_contact']
      })
      expect(recipeEntry).toMatchObject({
        id: 'teamnova:weather_core_entry',
        type: 'item',
        category: 'recipes',
        relatedRecipes: ['teamnova:weather_core']
      })
      expect(afterTasks.some((item) => item.id === 'content:index-entries')).toBe(false)
    })
  })

  it('proposes and applies missing HoloMap mission markers', async () => {
    await withProject(async (project) => {
      const missionPath = path.join(project, 'missions', 'first_contact.json')
      const mission = JSON.parse(await fs.readFile(missionPath, 'utf8'))
      mission.description = 'Locate the weather beacon and report home.'
      mission.holomapMarker = 'teamnova:first_contact_marker'
      mission.indexEntry = 'teamnova:first_contact_entry'
      await fs.writeFile(missionPath, JSON.stringify(mission, null, 2), 'utf8')

      const { applyCodexTask, listCodexTasks } = await import('../../main/codexTaskService')

      const tasks = await listCodexTasks(project)
      const task = tasks.find((item) => item.id === 'content:holomap-markers')

      expect(task).toBeDefined()
      expect(task?.kind).toBe('holomap_marker_fix')
      expect(task?.lane).toBe('waiting_review')
      expect(task?.fileChanges[0].path).toBe('holomap/mission_markers.json')
      expect(task?.fileChanges[0].diff).toContain('+      "id": "teamnova:first_contact_marker",')
      expect(task?.fileChanges[0].diff).toContain('+      "linkedMission": "teamnova:first_contact",')
      expect(task?.validationAfter?.warnings).toBeLessThan(task?.validationBefore?.warnings ?? 999)

      const result = await applyCodexTask(project, 'content:holomap-markers')
      const layer = JSON.parse(await fs.readFile(path.join(project, 'holomap', 'mission_markers.json'), 'utf8'))
      const afterTasks = await listCodexTasks(project)

      expect(result.filesChanged).toEqual(['holomap/mission_markers.json'])
      expect(layer).toMatchObject({
        id: 'teamnova:mission_markers',
        title: 'Mission Markers',
        type: 'mission_route',
        markers: [{
          id: 'teamnova:first_contact_marker',
          title: 'First Contact',
          icon: 'mission',
          linkedMission: 'teamnova:first_contact',
          linkedIndex: 'teamnova:first_contact_entry'
        }]
      })
      expect(afterTasks.some((item) => item.id === 'content:holomap-markers')).toBe(false)
    })
  })
})
