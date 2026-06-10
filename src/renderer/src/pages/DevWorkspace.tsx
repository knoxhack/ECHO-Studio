import { useCallback, useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { DEV_TASKS, type DevTaskId, type DevTaskRun, type DevWorkspaceMode, type DevWorkspaceState } from '@shared/devWorkspace'
import { MODULE_READY_TASKS, PREVIEW_RUNTIME_TASKS, moduleReadinessDisabledReason, previewRuntimeDisabledReason } from '@shared/previewRuntime'
import type { Runtime } from '@shared/types'

const RUNTIME_OPTIONS: Array<{ id: Runtime; label: string }> = [
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'echo_native', label: 'ECHO Native' },
  { id: 'standalone', label: 'Standalone Runtime' }
]

const MODES: Array<{ id: DevWorkspaceMode; label: string; description: string }> = [
  { id: 'visual', label: 'Visual Only', description: 'Keep code optional and use builders, validation, preview, and release tools.' },
  { id: 'gradle', label: 'Gradle Project', description: 'Generate pinned Gradle launchers, source folders, resources, scripts, and local build tasks.' },
  { id: 'full', label: 'Full Developer Workspace', description: 'Generate pinned Gradle setup plus multi-runtime preview and release scaffolding.' }
]

const TASK_GROUPS: Array<{ id: string; title: string; description: string; tasks: DevTaskId[] }> = [
  {
    id: 'gradle',
    title: 'Gradle Build Loop',
    description: 'Inspect tasks, build, test, clean, and generate NeoForge data from the pinned workspace.',
    tasks: ['gradle:tasks', 'gradle:build', 'gradle:test', 'gradle:clean', 'gradle:runData']
  },
  {
    id: 'runtime',
    title: 'Runtime Preview',
    description: 'Start local clients and runtime previews for the targets selected during setup.',
    tasks: ['gradle:runClient', 'gradle:runServer', 'preview:native', 'preview:standalone']
  },
  {
    id: 'modules',
    title: 'ECHO Modules',
    description: 'Inspect the resolved module closure, validate the local module graph, and build visibility artifacts.',
    tasks: ['gradle:moduleWorkspace', 'modules:validate', 'modules:releaseSelected', 'modules:releaseAll', 'modules:verifyRelease', 'modules:docsAudit']
  },
  {
    id: 'release',
    title: 'Release Assets',
    description: 'Package the local addon release with sidecar manifests, checksums, and Release Index handoff files.',
    tasks: ['package:local']
  }
]

const DEV_TASK_BY_ID = new Map<DevTaskId, (typeof DEV_TASKS)[number]>(DEV_TASKS.map((task) => [task.id, task]))
const MODULE_READY_TASK_SET = new Set<DevTaskId>(MODULE_READY_TASKS)

function projectFilePath(rootPath: string, filePath: string): string {
  if (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\') || filePath.startsWith('/')) return filePath
  const separator = rootPath.includes('\\') ? '\\' : '/'
  const base = rootPath.replace(/[\\/]+$/, '')
  return `${base}${separator}${filePath.replace(/[\\/]+/g, separator)}`
}

export default function DevWorkspace(): JSX.Element {
  const { activeProject, config, toast } = useWorkspace()
  const [state, setState] = useState<DevWorkspaceState | null>(null)
  const [mode, setMode] = useState<DevWorkspaceMode>('gradle')
  const [runtimes, setRuntimes] = useState<Runtime[]>(['neoforge', 'echo_native'])
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [lastRun, setLastRun] = useState<DevTaskRun | null>(null)
  const [liveLog, setLiveLog] = useState('')
  const [setupSummary, setSetupSummary] = useState<{ written: string[]; skipped: string[] } | null>(null)

  const hydrateRunningTask = useCallback(async () => {
    if (!activeProject) return
    const result = await window.studio.listRunningDevTasks(activeProject.path)
    if (!result.ok || !result.data) return
    setLastRun((current) => {
      const running = result.data!
      if (running.length > 0) {
        return running.find((task) => task.logPath === current?.logPath) ?? running[0]
      }
      return current?.status === 'started' ? null : current
    })
  }, [activeProject])

  const inspect = useCallback(async () => {
    if (!activeProject) return
    const [result] = await Promise.all([
      window.studio.inspectDevWorkspace(activeProject.path),
      hydrateRunningTask()
    ])
    if (result.ok && result.data) {
      setState(result.data)
      setMode(result.data.lastSetupAt ? result.data.mode : 'gradle')
      if (result.data.runtimeTargets.length > 0) setRuntimes(result.data.runtimeTargets)
    }
  }, [activeProject, hydrateRunningTask])

  useEffect(() => {
    void inspect()
  }, [inspect])

  useEffect(() => {
    if (!activeProject || !lastRun?.logPath) {
      setLiveLog('')
      return
    }
    let cancelled = false
    const read = async (): Promise<void> => {
      const result = await window.studio.readDevTaskLog(activeProject.path, lastRun.logPath!)
      if (!cancelled && result.ok && result.data !== undefined) setLiveLog(result.data)
    }
    void read()
    const interval = window.setInterval(() => { void read() }, lastRun.status === 'started' ? 1000 : 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeProject, lastRun?.logPath, lastRun?.status])

  if (!activeProject) {
    return (
      <Page title="Dev Workspace" subtitle="Generate local Gradle setup, run dev clients, build, test, and package locally.">
        <NoProject />
      </Page>
    )
  }

  const toggleRuntime = (runtime: Runtime): void => {
    setRuntimes((current) =>
      current.includes(runtime)
        ? current.filter((item) => item !== runtime)
        : [...current, runtime]
    )
  }

  const setup = async (): Promise<void> => {
    setBusy(true)
    const result = await window.studio.setupDevWorkspace(activeProject.path, {
      mode,
      runtimes,
      force,
      runtimeTools: {
        echoNativeExecutable: config.runtimeTools.echoNativeExecutable,
        standaloneExecutable: config.runtimeTools.standaloneExecutable
      }
    })
    setBusy(false)
    if (result.ok && result.data) {
      setState(result.data.state)
      setSetupSummary({ written: result.data.written, skipped: result.data.skipped })
      toast(`Dev workspace ready: ${result.data.written.length} file(s) written`)
    } else {
      toast(result.error || 'Dev workspace setup failed')
    }
  }

  const runTask = async (taskId: DevTaskId): Promise<void> => {
    setBusy(true)
    setLastRun(null)
    setLiveLog('')
    const result = await window.studio.runDevTask(activeProject.path, taskId)
    setBusy(false)
    if (result.ok && result.data) {
      setLastRun(result.data)
      setState((current) => current ? { ...current, artifacts: result.data!.artifacts } : current)
      toast(`${taskId} ${result.data.status}`)
      void inspect()
    } else {
      toast(result.error || `${taskId} failed`)
    }
  }

  const stopTask = async (): Promise<void> => {
    if (!activeProject || !lastRun?.logPath) return
    setStopping(true)
    const result = await window.studio.stopDevTask(activeProject.path, lastRun.logPath)
    setStopping(false)
    if (result.ok && result.data) {
      const stop = result.data
      setLastRun((current) =>
        current && current.logPath === stop.logPath
          ? {
              ...current,
              status: stop.status === 'stopped' ? 'stopped' : current.status,
              finishedAt: stop.finishedAt ?? current.finishedAt,
              stdout: `${current.stdout}${current.stdout ? '\n' : ''}${stop.message}`
            }
          : current
      )
      const log = await window.studio.readDevTaskLog(activeProject.path, stop.logPath)
      if (log.ok && log.data !== undefined) setLiveLog(log.data)
      toast(stop.message)
      void inspect()
    } else {
      toast(result.error || 'Unable to stop dev task')
    }
  }

  const readyTone = state?.ready ? 'var(--good)' : 'var(--warn)'
  const gradleValue = state
    ? state.gradleReady
      ? state.hasGradleWrapper ? 'Pinned Launcher' : 'Project Files'
      : 'Missing'
    : '...'
  const toolchainReady = Boolean(state?.toolchain.javaMeetsRequirement && state.toolchain.gradleAvailable)
  const toolchainValue = state
    ? toolchainReady
      ? 'Ready'
      : !state.toolchain.javaAvailable
        ? 'Java Missing'
        : !state.toolchain.javaMeetsRequirement
          ? `Java ${state.toolchain.requiredJavaVersion} Needed`
          : 'Gradle Missing'
    : '...'
  const launcherValue = state
    ? state.runtimeLaunchers.ready ? 'Ready' : 'Needs Path'
    : '...'
  const expectedFiles = state?.files.filter((file) => file.expected) ?? []
  const optionalFiles = state?.files.filter((file) => !file.expected) ?? []
  const missingRuntimeTools = [
    runtimes.includes('echo_native') && !config.runtimeTools.echoNativeExecutable ? 'ECHO Native executable' : '',
    runtimes.includes('standalone') && !config.runtimeTools.standaloneExecutable ? 'Standalone executable' : ''
  ].filter(Boolean)
  const workspaceLauncherIssues = state
    ? [
        state.runtimeLaunchers.nativeExpected && !state.runtimeLaunchers.nativeConfigured ? 'ECHO Native preview path' : '',
        state.runtimeLaunchers.standaloneExpected && !state.runtimeLaunchers.standaloneConfigured ? 'Standalone preview path' : ''
      ].filter(Boolean)
    : []
  const blockedModules = state?.modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked') ?? []
  const moduleGateReason = state ? moduleReadinessDisabledReason(state, 'running local build, preview, or package tasks') : null
  const gradleDependencyIssues = state?.moduleWorkspace.gradleDependencyIssues ?? []

  const taskDisabledReason = (taskId: DevTaskId): string | null => {
    if (!state) return 'Inspecting workspace.'
    if (PREVIEW_RUNTIME_TASKS.includes(taskId)) return previewRuntimeDisabledReason(taskId, state, Boolean(activeProject))
    if (MODULE_READY_TASK_SET.has(taskId)) {
      if (!state.moduleLock.upToDate) return 'Refresh Dev Workspace so generated module locks match the current manifest.'
      if (!state.moduleWorkspace.upToDate) return 'Refresh Dev Workspace so local module source map matches the current manifest.'
      const moduleReason = moduleReadinessDisabledReason(state, `running ${DEV_TASK_BY_ID.get(taskId)?.label ?? 'this task'}`)
      if (moduleReason) return moduleReason
    }
    if (taskId.startsWith('modules:') && !state.moduleCatalog.localAvailable) return 'Local ECHO-Modules index was not found.'
    if (taskId === 'modules:releaseSelected' && !state.modulePlan.closure.some((mod) => mod.moduleDir || mod.descriptorPath)) return 'No resolved modules are linked to local ECHO-Modules source.'
    if ((taskId.startsWith('gradle:') || taskId.startsWith('preview:')) && !state.gradleReady) return 'Set up a Gradle workspace first.'
    if ((taskId.startsWith('gradle:') || taskId.startsWith('preview:')) && !state.toolchain.javaAvailable) return `Install Java ${state.toolchain.requiredJavaVersion} or add it to PATH.`
    if ((taskId.startsWith('gradle:') || taskId.startsWith('preview:')) && !state.toolchain.javaMeetsRequirement) return `Use Java ${state.toolchain.requiredJavaVersion} for this generated workspace.`
    if ((taskId.startsWith('gradle:') || taskId.startsWith('preview:')) && !state.toolchain.gradleAvailable) return 'Run setup to generate the pinned Gradle launcher or install Gradle.'
    if (taskId === 'gradle:moduleWorkspace' && !state.moduleWorkspace.upToDate) return 'Run setup to refresh the module workspace map.'
    if (taskId === 'gradle:runData' && !state.runtimeTargets.includes('neoforge')) return 'Enable the NeoForge target and run setup.'
    return null
  }

  const taskStatusClass = (status: DevTaskRun['status']): string => {
    if (status === 'failed') return 'fixes'
    if (status === 'started' || status === 'stopped') return 'local'
    return 'ready'
  }

  const openProjectPath = (filePath: string): void => {
    window.studio.openPath(projectFilePath(activeProject.path, filePath))
  }

  return (
    <Page
      title="Dev Workspace"
      subtitle="Local-first developer setup for Gradle projects, dev clients, builds, tests, previews, and release artifacts."
      actions={
        <>
          <button className="btn" disabled={busy} onClick={inspect}>Refresh</button>
          <button className="btn primary" disabled={busy || runtimes.length === 0} onClick={setup}>
            {busy ? 'Working...' : 'Set Up Workspace'}
          </button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Metric label="Workspace" value={state?.ready ? 'Ready' : 'Needs Setup'} tone={readyTone} />
        <Metric label="Gradle" value={gradleValue} tone={state?.gradleReady ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Toolchain" value={toolchainValue} tone={toolchainReady ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Launchers" value={launcherValue} tone={state?.runtimeLaunchers.ready ? 'var(--good)' : 'var(--warn)'} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Setup Wizard</h3>
          <div className="grid cols-3" style={{ gap: 8 }}>
            {MODES.map((item) => (
              <button
                key={item.id}
                className={`tile ${mode === item.id ? 'selected' : ''}`}
                style={{ textAlign: 'left' }}
                onClick={() => setMode(item.id)}
              >
                <h4>{item.label}</h4>
                <p>{item.description}</p>
              </button>
            ))}
          </div>

          <div className="section-title">Runtime Targets</div>
          <div className="btn-row">
            {RUNTIME_OPTIONS.map((runtime) => (
              <label className="checkbox" key={runtime.id}>
                <input
                  type="checkbox"
                  checked={runtimes.includes(runtime.id)}
                  onChange={() => toggleRuntime(runtime.id)}
                />
                {runtime.label}
              </label>
            ))}
          </div>
          {missingRuntimeTools.length > 0 && (
            <div className="issue INFO" style={{ marginTop: 10 }}>
              <span className="lvl">INFO</span>
              Preview launchers need: {missingRuntimeTools.join(', ')}.
              <div className="fix">Add local runtime executable paths in Settings, then run Set Up Workspace again.</div>
            </div>
          )}
          {workspaceLauncherIssues.length > 0 && (
            <div className="issue WARNING" style={{ marginTop: 10 }}>
              <span className="lvl">WARNING</span>
              Generated workspace is missing: {workspaceLauncherIssues.join(', ')}.
              <div className="fix">
                Set runtime executable paths in Settings and run Set Up Workspace to update {state?.runtimeLaunchers.gradlePropertiesPath}.
              </div>
            </div>
          )}
          {state && state.mode !== 'visual' && state.toolchain.issues.length > 0 && (
            <div className="issue WARNING" style={{ marginTop: 10 }}>
              <span className="lvl">WARNING</span>
              Toolchain needs attention: {state.toolchain.issues.join(' ')}
              <div className="fix">
                Required Java: {state.toolchain.requiredJavaVersion}. Gradle command: {state.toolchain.gradleCommand}.
              </div>
            </div>
          )}
          <label className="checkbox" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
            Overwrite Studio-generated files
          </label>
          {setupSummary && (
            <div className="issue INFO" style={{ marginTop: 12 }}>
              <span className="lvl">INFO</span>
              Wrote {setupSummary.written.length} file(s)
              {setupSummary.skipped.length > 0 ? ` and skipped ${setupSummary.skipped.length} existing file(s).` : '.'}
              {setupSummary.skipped.length > 0 && (
                <div className="fix">
                  Enable overwrite to replace Studio-generated files: {setupSummary.skipped.slice(0, 4).join(', ')}
                  {setupSummary.skipped.length > 4 ? '...' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Module Closure</h3>
          {state ? (
            <>
              <div className="btn-row" style={{ marginBottom: 10 }}>
                <span className={`badge ${state.moduleLock.upToDate ? 'ready' : 'fixes'}`}>
                  {state.moduleLock.upToDate ? 'Lock Current' : 'Lock Stale'}
                </span>
                <span className={`badge ${state.moduleCatalog.localAvailable ? 'ready' : 'local'}`}>
                  {state.moduleCatalog.localAvailable ? 'Local ECHO-Modules' : 'Built-in Catalog'}
                </span>
                <span className={`badge ${state.moduleWorkspace.localModuleCount > 0 ? 'ready' : 'local'}`}>
                  {state.moduleWorkspace.localModuleCount}/{state.moduleWorkspace.moduleCount} local sources
                </span>
                <span className={`badge ${(state.moduleWorkspace.gradleBuildCount ?? 0) > 0 ? 'ready' : 'local'}`}>
                  {state.moduleWorkspace.gradleBuildCount ?? 0} Gradle builds
                </span>
                <span className={`badge ${(state.moduleWorkspace.gradleDependencyReadyCount ?? 0) > 0 ? 'ready' : 'local'}`}>
                  {state.moduleWorkspace.gradleDependencyReadyCount ?? 0} compile deps
                </span>
                {state.moduleLock.generatedAt && (
                  <span className="dim" style={{ fontSize: 11 }}>
                    generated {new Date(state.moduleLock.generatedAt).toLocaleString()}
                  </span>
                )}
                {state.moduleCatalog.moduleRoot && (
                  <button className="btn ghost" onClick={() => window.studio.openPath(state.moduleCatalog.moduleRoot!)}>
                    Open Modules
                  </button>
                )}
                {state.moduleWorkspace.exists && (
                  <button className="btn ghost" onClick={() => openProjectPath(state.moduleWorkspace.path)}>
                    Open Workspace Map
                  </button>
                )}
                {state.moduleLock.studioExists && (
                  <button className="btn ghost" onClick={() => openProjectPath(state.moduleLock.studioLockPath)}>
                    Open Studio Lock
                  </button>
                )}
                {state.moduleLock.runtimeExists && (
                  <button className="btn ghost" onClick={() => openProjectPath(state.moduleLock.runtimeLockPath)}>
                    Open Runtime Lock
                  </button>
                )}
              </div>
              {state.moduleCatalog.indexPath && (
                <div className="mono dim" style={{ fontSize: 11, marginBottom: 10 }}>
                  {state.moduleCatalog.indexPath}
                </div>
              )}
              {state.moduleCatalog.warnings.length > 0 && (
                <div className="issue WARNING" style={{ marginBottom: 12 }}>
                  <span className="lvl">WARNING</span>
                  {state.moduleCatalog.warnings.join(' ')}
                </div>
              )}
              {moduleGateReason && blockedModules.length === 0 && (
                <div className="issue WARNING" style={{ marginBottom: 12 }}>
                  <span className="lvl">WARNING</span>
                  {moduleGateReason}
                </div>
              )}
              {!state.moduleWorkspace.upToDate && (
                <div className="issue WARNING" style={{ marginBottom: 12 }}>
                  <span className="lvl">WARNING</span>
                  Module workspace map does not match the current manifest.
                  <div className="fix">
                    Run Set Up Workspace to refresh {state.moduleWorkspace.path}.
                    {state.moduleWorkspace.missingFromMap.length > 0 ? ` Missing: ${state.moduleWorkspace.missingFromMap.join(', ')}.` : ''}
                    {state.moduleWorkspace.extraInMap.length > 0 ? ` Extra: ${state.moduleWorkspace.extraInMap.join(', ')}.` : ''}
                  </div>
                </div>
              )}
              {gradleDependencyIssues.length > 0 && (
                <div className="issue WARNING" style={{ marginBottom: 12 }}>
                  <span className="lvl">WARNING</span>
                  Some local module builds are not wired as compile dependencies.
                  <div className="fix">
                    {gradleDependencyIssues.map((issue) => (
                      `${issue.moduleName} missing ${issue.missingProjectDependencies.join(', ')}`
                    )).join('; ')}. Add those local projects to the selected module closure, then run Set Up Workspace again.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {state.modulePlan.closure.map((mod) => (
                  <span key={mod.id} className="badge">{mod.name}</span>
                ))}
                {state.modulePlan.closure.length === 0 && <span className="dim">No ECHO modules declared.</span>}
              </div>
              {state.modulePlan.missingRequired.length > 0 && (
                <div className="issue WARNING" style={{ marginTop: 12 }}>
                  <span className="lvl">WARNING</span>
                  Missing required modules: {state.modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.
                </div>
              )}
              {state.modulePlan.unknown.length > 0 && (
                <div className="issue WARNING" style={{ marginTop: 12 }}>
                  <span className="lvl">WARNING</span>
                  Unknown dependencies: {state.modulePlan.unknown.join(', ')}.
                </div>
              )}
              {blockedModules.length > 0 && (
                <div className="issue BLOCKER" style={{ marginTop: 12 }}>
                  <span className="lvl">BLOCKER</span>
                  Blocked modules cannot be used by local preview, build, package, or public release tasks.
                  <div className="fix">{blockedModules.map((mod) => `${mod.name}${mod.blockReason ? `: ${mod.blockReason}` : ''}`).join(' ')}</div>
                </div>
              )}
              {!state.moduleLock.upToDate && (
                <div className="issue WARNING" style={{ marginTop: 12 }}>
                  <span className="lvl">WARNING</span>
                  Module lock does not match the current manifest.
                  <div className="fix">
                    Run Set Up Workspace to refresh .echo-studio/modules.lock.json
                    {state.moduleLock.runtimeExpected ? ' and src/generated/resources/META-INF/echo.modules.lock.json.' : '.'}
                    {state.moduleLock.missingFromLock.length > 0 ? ` Missing: ${state.moduleLock.missingFromLock.join(', ')}.` : ''}
                    {state.moduleLock.extraInLock.length > 0 ? ` Extra: ${state.moduleLock.extraInLock.join(', ')}.` : ''}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="dim">Inspecting local project setup...</p>
          )}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Generated Files</h3>
          {expectedFiles.map((file) => (
            <div className="list-row" key={file.path} style={{ padding: '7px 10px' }}>
              <span style={{ color: file.exists ? 'var(--good)' : 'var(--warn)' }}>{file.exists ? 'OK' : 'Missing'}</span>
              <span className="mono" style={{ flex: 1 }}>{file.path}</span>
              {file.generatedByStudio && <span className="badge ready">Studio</span>}
              <span className="badge">Expected</span>
            </div>
          ))}
          {optionalFiles.some((file) => file.exists) && (
            <>
              <div className="section-title">Optional Existing Files</div>
              {optionalFiles.filter((file) => file.exists).map((file) => (
                <div className="list-row" key={file.path} style={{ padding: '7px 10px' }}>
                  <span style={{ color: 'var(--good)' }}>OK</span>
                  <span className="mono" style={{ flex: 1 }}>{file.path}</span>
                  {file.generatedByStudio && <span className="badge ready">Studio</span>}
                  <span className="badge local">Optional</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <h3>Local Tool Lanes</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {TASK_GROUPS.map((group) => {
              const reasons = group.tasks.map((taskId) => taskDisabledReason(taskId))
              const availableCount = reasons.filter((reason) => !reason).length
              return (
                <div key={group.id}>
                  <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <h4>{group.title}</h4>
                      <p>{group.description}</p>
                    </div>
                    <span className={`badge ${availableCount > 0 ? 'ready' : 'local'}`}>
                      {availableCount}/{group.tasks.length} ready
                    </span>
                  </div>
                  <div className="grid cols-2" style={{ gap: 8 }}>
                    {group.tasks.map((taskId) => {
                      const task = DEV_TASK_BY_ID.get(taskId)
                      if (!task) return null
                      const reason = taskDisabledReason(task.id)
                      return (
                        <button
                          key={task.id}
                          className="tile"
                          style={{ textAlign: 'left', padding: 12 }}
                          disabled={busy || Boolean(reason)}
                          onClick={() => runTask(task.id)}
                        >
                          <h4>{task.label}</h4>
                          <p>{reason ?? task.description}</p>
                          <span className={`badge ${reason ? 'local' : 'ready'}`}>{reason ? 'Unavailable' : task.kind}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Task Output</h3>
          {lastRun ? (
            <>
              <div className="btn-row" style={{ marginBottom: 10 }}>
                <span className={`badge ${taskStatusClass(lastRun.status)}`}>{lastRun.status}</span>
                <span className="badge">{lastRun.command}</span>
                {lastRun.pid && <span className="badge">pid {lastRun.pid}</span>}
                {lastRun.status === 'started' && lastRun.logPath && (
                  <button className="btn" disabled={stopping} onClick={stopTask}>
                    {stopping ? 'Stopping...' : 'Stop Task'}
                  </button>
                )}
                {lastRun.logPath && (
                  <button className="btn ghost" onClick={() => window.studio.openPath(lastRun.logPath!)}>
                    Open Log
                  </button>
                )}
              </div>
              <div className="code" style={{ whiteSpace: 'pre-wrap', maxHeight: 260 }}>
                {liveLog || lastRun.stdout || 'No log output yet.'}
                {!liveLog && lastRun.stderr ? `\n\nSTDERR\n${lastRun.stderr}` : ''}
              </div>
            </>
          ) : (
            <p className="dim">Run a local task to see output.</p>
          )}
        </div>

        <div className="card">
          <h3>Artifacts</h3>
          {state?.artifacts.length ? (
            state.artifacts.map((artifact) => (
              <div className="list-row" key={artifact.path} style={{ padding: '7px 10px' }}>
                <span className="badge">{artifact.kind}</span>
                <span className="mono" style={{ flex: 1 }}>{artifact.name}</span>
                <span className="dim" style={{ fontSize: 11 }}>{Math.round(artifact.bytes / 1024)} KB</span>
                <button className="btn ghost" onClick={() => window.studio.openPath(artifact.path)}>
                  Open
                </button>
              </div>
            ))
          ) : (
            <p className="dim">No local artifacts yet. Build or package to populate this list.</p>
          )}
        </div>
      </div>
    </Page>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ fontSize: 20, color: tone ?? 'var(--accent)' }}>{value}</div>
    </div>
  )
}
