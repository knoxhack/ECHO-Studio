import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AddonProject } from '@shared/types'
import type { CreatorProfile } from '@shared/profile'
import type { AppConfig } from '@shared/config'
import { DEFAULT_PROFILE } from '@shared/profile'
import { DEFAULT_CONFIG } from '@shared/config'

interface WorkspaceState {
  workspaceDir: string
  projects: AddonProject[]
  activeProjectPath: string | null
  activeProject: AddonProject | null
  loading: boolean
  refresh: () => Promise<void>
  setWorkspaceDir: (dir: string) => void
  chooseWorkspace: () => Promise<void>
  setActiveProject: (path: string | null) => void
  toast: (msg: string) => void
  toastMsg: string | null
  profile: CreatorProfile
  config: AppConfig
  updateProfile: (patch: Partial<CreatorProfile>) => Promise<void>
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>
}

const Ctx = createContext<WorkspaceState | null>(null)

const WS_KEY = 'echo.workspaceDir'
const ACTIVE_KEY = 'echo.activeProject'

export function WorkspaceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [workspaceDir, setWorkspaceDirState] = useState<string>(localStorage.getItem(WS_KEY) || '')
  const [projects, setProjects] = useState<AddonProject[]>([])
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(
    localStorage.getItem(ACTIVE_KEY)
  )
  const [loading, setLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [profile, setProfile] = useState<CreatorProfile>(DEFAULT_PROFILE)
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    if (!workspaceDir) return
    setLoading(true)
    const res = await window.studio.listProjects(workspaceDir)
    setLoading(false)
    if (res.ok && res.data) setProjects(res.data)
  }, [workspaceDir])

  const setWorkspaceDir = useCallback((dir: string) => {
    localStorage.setItem(WS_KEY, dir)
    setWorkspaceDirState(dir)
  }, [])

  const chooseWorkspace = useCallback(async () => {
    const res = await window.studio.chooseWorkspace()
    if (res.ok && res.data) setWorkspaceDir(res.data)
  }, [setWorkspaceDir])

  const setActiveProject = useCallback((path: string | null) => {
    if (path) localStorage.setItem(ACTIVE_KEY, path)
    else localStorage.removeItem(ACTIVE_KEY)
    setActiveProjectPath(path)
  }, [])

  // Initialise the default workspace on first run.
  useEffect(() => {
    if (workspaceDir) return
    window.studio.getDefaultWorkspace().then((res) => {
      if (res.ok && res.data) setWorkspaceDir(res.data)
    })
  }, [workspaceDir, setWorkspaceDir])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Load profile + config once.
  useEffect(() => {
    window.studio.getProfile().then((r) => r.ok && r.data && setProfile(r.data))
    window.studio.getConfig().then((r) => r.ok && r.data && setConfig(r.data))
  }, [])

  const updateProfile = useCallback(async (patch: Partial<CreatorProfile>) => {
    const res = await window.studio.setProfile(patch)
    if (res.ok && res.data) setProfile(res.data)
  }, [])

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    const res = await window.studio.setConfig(patch)
    if (res.ok && res.data) setConfig(res.data)
  }, [])

  // Sync theme attribute to document when config loads or changes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme === 'light' ? 'light' : 'dark')
  }, [config.theme])

  const activeProject = useMemo(
    () => projects.find((p) => p.path === activeProjectPath) ?? null,
    [projects, activeProjectPath]
  )

  const value: WorkspaceState = {
    workspaceDir,
    projects,
    activeProjectPath,
    activeProject,
    loading,
    refresh,
    setWorkspaceDir,
    chooseWorkspace,
    setActiveProject,
    toast,
    toastMsg,
    profile,
    config,
    updateProfile,
    updateConfig
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
