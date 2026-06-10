import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddonManifest,
  AddonProject,
  CreateAddonOptions,
  FileNode,
  IpcResult,
  PublishStatus,
  Runtime
} from '../shared/types'
import type { ContentRecord, ContentType } from '../shared/content/schemas'
import type { PackOSReport } from '../shared/types'
import type { AssetReport } from '../shared/assets'
import type {
  PackageResult,
  GitHubAppLoginStart,
  GitHubPublishingStatus,
  GitHubReleaseDraftResult,
  GitHubRepoConnection,
  ReleaseEntry,
  ReleasesState,
  SubmissionState
} from '../shared/publishing'
import type { AppConfig, AiChatResult, AiFile } from '../shared/config'
import type { CreatorProfile } from '../shared/profile'
import type { ExperienceResult, ServerPackResult } from '../shared/bundles'
import type { SandboxResult, SandboxOptions } from '../shared/sandbox'
import type { GitStatus, GitCommit, GitDiff, GitResult, GitBranch } from '../shared/git'
import type { DevSetupResult, DevTaskId, DevTaskRun, DevWorkspaceOptions, DevWorkspaceState } from '../shared/devWorkspace'
import type { EchoModuleCatalogResult } from '../shared/moduleCatalog'
import type { CodexTask, CodexTaskActionResult } from '../shared/codexTasks'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args)
}

// Typed API surface exposed to the renderer as window.studio.
const api = {
  getVersion: (): string => ipcRenderer.sendSync('app:version'),
  getDefaultWorkspace: () => invoke<string>('workspace:default'),
  chooseWorkspace: () => invoke<string | null>('workspace:choose'),
  chooseImportFile: () => invoke<string | null>('projects:chooseImport'),
  chooseImportFolder: () => invoke<string | null>('projects:chooseImportFolder'),
  chooseRuntimeExecutable: (runtime: Extract<Runtime, 'echo_native' | 'standalone'>) =>
    invoke<string | null>('runtime:chooseExecutable', runtime),

  listProjects: (workspaceDir: string) => invoke<AddonProject[]>('projects:list', workspaceDir),
  createAddon: (opts: CreateAddonOptions) => invoke<string>('projects:create', opts),
  createFromTemplate: (workspaceDir: string, templateId: string, namespace: string, addonId: string, name: string) =>
    invoke<string>('projects:createFromTemplate', workspaceDir, templateId, namespace, addonId, name),
  importProject: (workspaceDir: string, sourcePath: string) => invoke<string>('projects:import', workspaceDir, sourcePath),
  setPublishStatus: (path: string, status: PublishStatus) =>
    invoke<void>('projects:setStatus', path, status),

  readManifest: (projectPath: string) => invoke<AddonManifest>('manifest:read', projectPath),
  writeManifest: (projectPath: string, manifest: AddonManifest) =>
    invoke<void>('manifest:write', projectPath, manifest),

  readProjectTree: (projectPath: string) => invoke<FileNode>('project:tree', projectPath),
  readFile: (filePath: string) => invoke<string>('file:read', filePath),
  writeFile: (filePath: string, content: string) => invoke<void>('file:write', filePath, content),

  listContent: (projectPath: string, type: ContentType) =>
    invoke<ContentRecord[]>('content:list', projectPath, type),
  readContent: (filePath: string) => invoke<unknown>('content:read', filePath),
  writeContent: (projectPath: string, type: ContentType, item: { id: string }) =>
    invoke<string>('content:write', projectPath, type, item),
  deleteContent: (filePath: string) => invoke<void>('content:delete', filePath),
  listAllContent: (projectPath: string) =>
    invoke<Record<ContentType, ContentRecord[]>>('content:listAll', projectPath),
  fullCheck: (projectPath: string) => invoke<PackOSReport>('project:fullCheck', projectPath),

  scanAssets: (projectPath: string) => invoke<AssetReport>('assets:scan', projectPath),
  importAssets: (projectPath: string, folder: string) =>
    invoke<string[]>('assets:import', projectPath, folder),
  importAssetDrop: (projectPath: string, filePaths: string[]) =>
    invoke<string[]>('assets:importDrop', projectPath, filePaths),
  exportAssetPack: (projectPath: string) => invoke<string>('assets:exportPack', projectPath),

  packageAddon: (projectPath: string) => invoke<PackageResult>('package:build', projectPath),
  getGitHubPublishingStatus: () => invoke<GitHubPublishingStatus>('publish:authStatus'),
  startGitHubAppLogin: () => invoke<GitHubAppLoginStart>('publish:startGitHubAppLogin'),
  connectGitHubRepo: (owner: string, repo: string) => invoke<GitHubRepoConnection>('publish:connectRepo', owner, repo),
  createGitHubReleaseDraft: (releaseDraftPath: string, owner: string, repo: string, tag?: string, draft?: boolean) =>
    invoke<GitHubReleaseDraftResult>('publish:createDraft', releaseDraftPath, owner, repo, tag, draft),
  getSubmission: (projectPath: string) => invoke<SubmissionState>('submission:get', projectPath),
  saveSubmission: (projectPath: string, state: SubmissionState) =>
    invoke<void>('submission:save', projectPath, state),
  getReleases: (projectPath: string) => invoke<ReleasesState>('releases:get', projectPath),
  addRelease: (projectPath: string, entry: ReleaseEntry) =>
    invoke<ReleasesState>('releases:add', projectPath, entry),

  getConfig: () => invoke<AppConfig>('config:get'),
  setConfig: (patch: Partial<AppConfig>) => invoke<AppConfig>('config:set', patch),

  getProfile: () => invoke<CreatorProfile>('profile:get'),
  setProfile: (patch: Partial<CreatorProfile>) => invoke<CreatorProfile>('profile:set', patch),

  createExperience: (workspaceDir: string, namespace: string, id: string, name: string, members: string[]) =>
    invoke<ExperienceResult>('bundle:experience', workspaceDir, namespace, id, name, members),
  exportServerPack: (workspaceDir: string, name: string, members: string[]) =>
    invoke<ServerPackResult>('bundle:serverPack', workspaceDir, name, members),

  runSandbox: (projectPath: string, workspaceDir: string, profile: string, options: SandboxOptions) =>
    invoke<SandboxResult>('sandbox:run', projectPath, workspaceDir, profile, options),

  listEchoModules: (projectPath?: string) =>
    invoke<EchoModuleCatalogResult>('modules:list', projectPath),

  inspectDevWorkspace: (projectPath: string) =>
    invoke<DevWorkspaceState>('dev:inspect', projectPath),
  setupDevWorkspace: (projectPath: string, options: DevWorkspaceOptions) =>
    invoke<DevSetupResult>('dev:setup', projectPath, options),
  runDevTask: (projectPath: string, taskId: DevTaskId) =>
    invoke<DevTaskRun>('dev:runTask', projectPath, taskId),
  readDevTaskLog: (projectPath: string, logPath: string) =>
    invoke<string>('dev:readLog', projectPath, logPath),

  listCodexTasks: (projectPath: string) =>
    invoke<CodexTask[]>('codex:listTasks', projectPath),
  applyCodexTask: (projectPath: string, taskId: string) =>
    invoke<CodexTaskActionResult>('codex:applyTask', projectPath, taskId),
  rejectCodexTask: (projectPath: string, taskId: string, rejected: boolean) =>
    invoke<CodexTask[]>('codex:rejectTask', projectPath, taskId, rejected),

  gitStatus: (projectPath: string) => invoke<GitStatus>('git:status', projectPath),
  gitInit: (projectPath: string) => invoke<GitResult>('git:init', projectPath),
  gitCommit: (projectPath: string, message: string) => invoke<GitResult>('git:commit', projectPath, message),
  gitLog: (projectPath: string, count?: number) => invoke<GitCommit[]>('git:log', projectPath, count),
  gitDiff: (projectPath: string, filePath?: string) => invoke<GitDiff[]>('git:diff', projectPath, filePath),
  gitBranch: (projectPath: string) => invoke<GitBranch[]>('git:branch', projectPath),
  gitCheckout: (projectPath: string, branch: string, create?: boolean) => invoke<GitResult>('git:checkout', projectPath, branch, create),
  gitPush: (projectPath: string, remote?: string, branch?: string) => invoke<GitResult>('git:push', projectPath, remote, branch),
  gitPull: (projectPath: string, remote?: string, branch?: string) => invoke<GitResult>('git:pull', projectPath, remote, branch),
  gitRemote: (projectPath: string) => invoke<{ name: string; url: string }[]>('git:remote', projectPath),
  gitAddRemote: (projectPath: string, name: string, url: string) => invoke<GitResult>('git:addRemote', projectPath, name, url),

  aiChat: (projectPath: string | null, history: ChatMessage[]) =>
    invoke<AiChatResult>('ai:chat', projectPath, history),
  aiApplyFiles: (projectPath: string, files: AiFile[]) =>
    invoke<string[]>('ai:applyFiles', projectPath, files),

  openPath: (p: string) => invoke<string>('shell:openPath', p),
  openExternal: (url: string) => invoke<void>('shell:openExternal', url),

  // Auto-updater
  onUpdateStatus: (cb: (payload: { status: string; version?: string; percent?: number; message?: string }) => void) => {
    const handler = (_: unknown, payload: unknown) => cb(payload as never)
    ipcRenderer.on('update-status', handler)
    return () => { ipcRenderer.removeListener('update-status', handler) }
  },
  installUpdate: () => ipcRenderer.send('update:install')
}

export type StudioApi = typeof api

contextBridge.exposeInMainWorld('studio', api)
