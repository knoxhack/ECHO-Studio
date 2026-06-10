import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import type { CreateAddonOptions, AddonManifest, IpcResult, PublishStatus, Runtime } from '../shared/types'
import type { ContentType } from '../shared/content/schemas'
import {
  createAddon,
  createFromTemplate,
  listProjects,
  readManifest,
  writeManifest,
  readProjectTree,
  readFileText,
  writeFileText,
  defaultWorkspace,
  setPublishStatus,
  listAssetFiles,
  importProject
} from './fsService'
import {
  listContent,
  readContent,
  writeContent,
  deleteContent,
  readAllContent,
  readLangKeys
} from './contentService'
import { runProjectCheck } from '../shared/projectValidation'
import { scanAssets, importAssets, exportAssetPack } from './assetService'
import { packageAddon } from './packageService'
import { connectGitHubRepo, createGitHubReleaseDraft, getGitHubPublishingStatus, startGitHubAppLogin } from './publishingService'
import {
  getSubmission,
  saveSubmission,
  getReleases,
  addRelease
} from './studioStore'
import type { ReleaseEntry, SubmissionState } from '../shared/publishing'
import { getConfig, setConfig } from './config'
import { getProfile, setProfile } from './profileStore'
import type { CreatorProfile } from '../shared/profile'
import { createExperience, exportServerPack } from './bundleService'
import { chat } from './aiService'
import type { ChatMessage } from './aiService'
import type { AppConfig, AiFile } from '../shared/config'
import { runPreviewScan } from './previewScanService'
import type { PreviewScanOptions } from '../shared/previewScan'
import { gitStatus, gitInit, gitCommit, gitLog, gitDiff, gitBranch, gitCheckout, gitPush, gitPull, gitRemote, gitAddRemote } from './gitService'
import { join, basename } from 'path'
import { inspectDevWorkspace, readDevTaskLog, runDevTask, setupDevWorkspace, stopDevTask } from './devWorkspaceService'
import type { DevTaskId, DevWorkspaceOptions } from '../shared/devWorkspace'
import { listEchoModules } from './moduleCatalogService'
import { applyCodexTask, listCodexTasks, setCodexTaskRejected } from './codexTaskService'

// Wrap a handler so every channel returns a uniform IpcResult.
function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await fn(...(args as TArgs))
      return { ok: true, data } as IpcResult<TResult>
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) } as IpcResult
    }
  })
}

export function registerIpc(): void {
  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion()
  })

  handle('workspace:default', () => defaultWorkspace())

  handle('workspace:choose', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  handle('projects:chooseImport', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Addon archives', extensions: ['zip'] }, { name: 'All files', extensions: ['*'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  handle('projects:chooseImportFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  handle('runtime:chooseExecutable', async (runtime: Extract<Runtime, 'echo_native' | 'standalone'>) => {
    const win = BrowserWindow.getFocusedWindow()
    const runtimeLabel = runtime === 'echo_native' ? 'ECHO Native' : 'Standalone Runtime'
    const executableFilters = process.platform === 'win32'
      ? [
          { name: 'Executables', extensions: ['exe', 'cmd', 'bat'] },
          { name: 'All files', extensions: ['*'] }
        ]
      : [{ name: 'All files', extensions: ['*'] }]
    const res = await dialog.showOpenDialog(win!, {
      title: `Select ${runtimeLabel} executable`,
      buttonLabel: 'Use Executable',
      properties: ['openFile'],
      filters: executableFilters
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  handle('projects:list', (workspaceDir: string) => listProjects(workspaceDir))
  handle('projects:create', (opts: CreateAddonOptions) => createAddon(opts))
  handle(
    'projects:createFromTemplate',
    (workspaceDir: string, templateId: string, namespace: string, addonId: string, name: string) =>
      createFromTemplate(workspaceDir, templateId, namespace, addonId, name)
  )
  handle('projects:import', (workspaceDir: string, sourcePath: string) => importProject(workspaceDir, sourcePath))
  handle('projects:setStatus', (path: string, status: PublishStatus) => setPublishStatus(path, status))

  handle('manifest:read', (projectPath: string) => readManifest(projectPath))
  handle('manifest:write', (projectPath: string, manifest: AddonManifest) =>
    writeManifest(projectPath, manifest)
  )

  handle('project:tree', (projectPath: string) => readProjectTree(projectPath))
  handle('file:read', (filePath: string) => readFileText(filePath))
  handle('file:write', (filePath: string, content: string) => writeFileText(filePath, content))

  handle('content:list', (projectPath: string, type: ContentType) =>
    listContent(projectPath, type)
  )
  handle('content:read', (filePath: string) => readContent(filePath))
  handle('content:write', (projectPath: string, type: ContentType, item: { id: string }) =>
    writeContent(projectPath, type, item)
  )
  handle('content:delete', (filePath: string) => deleteContent(filePath))
  handle('content:listAll', (projectPath: string) => readAllContent(projectPath))

  handle('project:fullCheck', async (projectPath: string) => {
    const manifest = await readManifest(projectPath)
    if (!manifest) throw new Error('Missing echo.mod.json')
    const moduleCatalog = await listEchoModules(projectPath)
    const devWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
    const all = await readAllContent(projectPath)
    const content: Record<string, { id: string; data: unknown }[]> = {}
    for (const [type, records] of Object.entries(all)) {
      content[type] = records.map((r) => ({ id: r.id, data: r.data }))
    }
    const langKeys = await readLangKeys(projectPath)
    const assetFiles = await listAssetFiles(projectPath)
    return runProjectCheck({
      manifest,
      content: content as never,
      langKeys,
      assetFiles,
      moduleCatalog: moduleCatalog.catalog,
      devWorkspace
    })
  })

  handle('assets:scan', (projectPath: string) => scanAssets(projectPath))
  handle('assets:import', (projectPath: string, folder: string) => importAssets(projectPath, folder))
  handle('assets:importDrop', async (projectPath: string, filePaths: string[]) => {
    const destDir = join(projectPath, 'assets', 'drop')
    await fs.mkdir(destDir, { recursive: true })
    const copied: string[] = []
    for (const src of filePaths) {
      const name = basename(src)
      if (!name) continue
      await fs.copyFile(src, join(destDir, name))
      copied.push(`drop/${name}`)
    }
    return copied
  })
  handle('assets:exportPack', (projectPath: string) => exportAssetPack(projectPath))

  handle('package:build', async (projectPath: string) => {
    const devWorkspace = await inspectDevWorkspace(projectPath).catch(() => undefined)
    return packageAddon(projectPath, devWorkspace)
  })
  handle('publish:authStatus', () => getGitHubPublishingStatus())
  handle('publish:startGitHubAppLogin', () => startGitHubAppLogin())
  handle('publish:connectRepo', (owner: string, repo: string) => connectGitHubRepo(owner, repo))
  handle('publish:createDraft', (releaseDraftPath: string, owner: string, repo: string, tag?: string, draft?: boolean) =>
    createGitHubReleaseDraft(releaseDraftPath, owner, repo, tag, draft ?? true)
  )
  handle('submission:get', (projectPath: string) => getSubmission(projectPath))
  handle('submission:save', (projectPath: string, state: SubmissionState) =>
    saveSubmission(projectPath, state)
  )
  handle('releases:get', (projectPath: string) => getReleases(projectPath))
  handle('releases:add', (projectPath: string, entry: ReleaseEntry) =>
    addRelease(projectPath, entry)
  )

  handle('config:get', () => getConfig())
  handle('config:set', (patch: Partial<AppConfig>) => setConfig(patch))

  handle('profile:get', () => getProfile())
  handle('profile:set', (patch: Partial<CreatorProfile>) => setProfile(patch))

  handle(
    'bundle:experience',
    (workspaceDir: string, namespace: string, id: string, name: string, members: string[]) =>
      createExperience(workspaceDir, namespace, id, name, members)
  )
  handle('bundle:serverPack', (workspaceDir: string, name: string, members: string[]) =>
    exportServerPack(workspaceDir, name, members)
  )

  handle('preview:scan', (projectPath: string, workspaceDir: string, profile: string, options: PreviewScanOptions) =>
    runPreviewScan(projectPath, workspaceDir, profile, options)
  )
  handle('sandbox:run', (projectPath: string, workspaceDir: string, profile: string, options: PreviewScanOptions) =>
    runPreviewScan(projectPath, workspaceDir, profile, options)
  )

  handle('modules:list', (projectPath?: string) => listEchoModules(projectPath))

  handle('dev:inspect', (projectPath: string) => inspectDevWorkspace(projectPath))
  handle('dev:setup', (projectPath: string, options: DevWorkspaceOptions) =>
    setupDevWorkspace(projectPath, options)
  )
  handle('dev:runTask', (projectPath: string, taskId: DevTaskId) =>
    runDevTask(projectPath, taskId)
  )
  handle('dev:stopTask', (projectPath: string, logPath: string) =>
    stopDevTask(projectPath, logPath)
  )
  handle('dev:readLog', (projectPath: string, logPath: string) =>
    readDevTaskLog(projectPath, logPath)
  )

  handle('codex:listTasks', (projectPath: string) => listCodexTasks(projectPath))
  handle('codex:applyTask', (projectPath: string, taskId: string) =>
    applyCodexTask(projectPath, taskId)
  )
  handle('codex:rejectTask', (projectPath: string, taskId: string, rejected: boolean) =>
    setCodexTaskRejected(projectPath, taskId, rejected)
  )

  handle('git:status', (projectPath: string) => gitStatus(projectPath))
  handle('git:init', (projectPath: string) => gitInit(projectPath))
  handle('git:commit', (projectPath: string, message: string) => gitCommit(projectPath, message))
  handle('git:log', (projectPath: string, count?: number) => gitLog(projectPath, count))
  handle('git:diff', (projectPath: string, filePath?: string) => gitDiff(projectPath, filePath))
  handle('git:branch', (projectPath: string) => gitBranch(projectPath))
  handle('git:checkout', (projectPath: string, branch: string, create?: boolean) => gitCheckout(projectPath, branch, create))
  handle('git:push', (projectPath: string, remote?: string, branch?: string) => gitPush(projectPath, remote, branch))
  handle('git:pull', (projectPath: string, remote?: string, branch?: string) => gitPull(projectPath, remote, branch))
  handle('git:remote', (projectPath: string) => gitRemote(projectPath))
  handle('git:addRemote', (projectPath: string, name: string, url: string) => gitAddRemote(projectPath, name, url))

  handle('ai:chat', (projectPath: string | null, history: ChatMessage[]) =>
    chat(projectPath, history)
  )
  handle('ai:applyFiles', async (projectPath: string, files: AiFile[]) => {
    const applied: string[] = []
    for (const f of files) {
      if (f.path.includes('..') || f.path.startsWith('/') || f.path.startsWith('\\')) {
        throw new Error(`Invalid file path: ${f.path}`)
      }
      const full = join(projectPath, f.path)
      const resolved = await fs.realpath(full).catch(() => full)
      const resolvedProject = await fs.realpath(projectPath).catch(() => projectPath)
      if (!resolved.startsWith(resolvedProject)) {
        throw new Error(`Path traversal blocked: ${f.path}`)
      }
      await writeFileText(full, f.content)
      applied.push(f.path)
    }
    return applied
  })

  handle('shell:openPath', (p: string) => shell.openPath(p))
  handle('shell:openExternal', (url: string) => shell.openExternal(url))
}
