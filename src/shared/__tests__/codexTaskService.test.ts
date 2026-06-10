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
})
