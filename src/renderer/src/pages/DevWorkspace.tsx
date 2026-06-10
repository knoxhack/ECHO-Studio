import { useCallback, useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { DEV_TASKS, type DevTaskId, type DevTaskRun, type DevWorkspaceMode, type DevWorkspaceState } from '@shared/devWorkspace'
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

export default function DevWorkspace(): JSX.Element {
  const { activeProject, toast } = useWorkspace()
  const [state, setState] = useState<DevWorkspaceState | null>(null)
  const [mode, setMode] = useState<DevWorkspaceMode>('gradle')
  const [runtimes, setRuntimes] = useState<Runtime[]>(['neoforge', 'echo_native'])
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastRun, setLastRun] = useState<DevTaskRun | null>(null)
  const [liveLog, setLiveLog] = useState('')
  const [setupSummary, setSetupSummary] = useState<{ written: string[]; skipped: string[] } | null>(null)

  const inspect = useCallback(async () => {
    if (!activeProject) return
    const result = await window.studio.inspectDevWorkspace(activeProject.path)
    if (result.ok && result.data) {
      setState(result.data)
      setMode(result.data.lastSetupAt ? result.data.mode : 'gradle')
      if (result.data.runtimeTargets.length > 0) setRuntimes(result.data.runtimeTargets)
    }
  }, [activeProject])

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
    const result = await window.studio.setupDevWorkspace(activeProject.path, { mode, runtimes, force })
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

  const readyTone = state?.ready ? 'var(--good)' : 'var(--warn)'
  const gradleValue = state
    ? state.gradleReady
      ? state.hasGradleWrapper ? 'Pinned Launcher' : 'Project Files'
      : 'Missing'
    : '...'
  const expectedFiles = state?.files.filter((file) => file.expected) ?? []
  const optionalFiles = state?.files.filter((file) => !file.expected) ?? []

  const taskDisabledReason = (taskId: DevTaskId): string | null => {
    if (!state) return 'Inspecting workspace.'
    if ((taskId.startsWith('gradle:') || taskId.startsWith('preview:')) && !state.gradleReady) return 'Set up a Gradle workspace first.'
    if (taskId === 'gradle:runClient' && !state.runtimeTargets.includes('neoforge')) return 'Enable the NeoForge target and run setup.'
    if (taskId === 'gradle:runServer' && !state.runtimeTargets.includes('neoforge')) return 'Enable the NeoForge target and run setup.'
    if (taskId === 'gradle:runData' && !state.runtimeTargets.includes('neoforge')) return 'Enable the NeoForge target and run setup.'
    if (taskId === 'preview:native' && !state.runtimeTargets.includes('echo_native')) return 'Enable ECHO Native and run setup.'
    if (taskId === 'preview:standalone' && !state.runtimeTargets.includes('standalone')) return 'Enable Standalone Runtime and run setup.'
    return null
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
        <Metric label="Source" value={state?.sourceReady ? 'Ready' : 'Missing'} tone={state?.sourceReady ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Expected Files" value={state ? `${expectedFiles.filter((file) => file.exists).length}/${expectedFiles.length}` : '...'} tone={state?.ready ? 'var(--good)' : 'var(--warn)'} />
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
          <h3>Local Tasks</h3>
          <div className="grid cols-2" style={{ gap: 8 }}>
            {DEV_TASKS.map((task) => {
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
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Task Output</h3>
          {lastRun ? (
            <>
              <div className="btn-row" style={{ marginBottom: 10 }}>
                <span className={`badge ${lastRun.status === 'failed' ? 'fixes' : 'ready'}`}>{lastRun.status}</span>
                <span className="badge">{lastRun.command}</span>
                {lastRun.pid && <span className="badge">pid {lastRun.pid}</span>}
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
