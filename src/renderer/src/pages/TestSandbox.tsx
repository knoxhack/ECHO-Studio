import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { DEV_TASKS, type DevTaskId, type DevTaskRun, type DevWorkspaceState } from '@shared/devWorkspace'
import type { SandboxResult, SandboxOptions } from '@shared/sandbox'

const PROFILES = [
  'Ashfall Sandbox',
  'ECHO Prime Sandbox',
  'Arcana Sandbox',
  'Generic ECHO Runtime Sandbox',
  'Server Sandbox'
]

const RUNTIME_TASKS: DevTaskId[] = [
  'gradle:runClient',
  'gradle:runServer',
  'preview:native',
  'preview:standalone'
]

export default function TestSandbox(): JSX.Element {
  const { activeProject, workspaceDir, config, toast } = useWorkspace()
  const nav = useNavigate()
  const [profile, setProfile] = useState(config.sandbox?.defaultProfile || PROFILES[0])
  const [running, setRunning] = useState(false)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeStopping, setRuntimeStopping] = useState(false)
  const [result, setResult] = useState<SandboxResult | null>(null)
  const [devWorkspace, setDevWorkspace] = useState<DevWorkspaceState | null>(null)
  const [runtimeRun, setRuntimeRun] = useState<DevTaskRun | null>(null)
  const [runtimeLog, setRuntimeLog] = useState('')
  const [error, setError] = useState('')
  const [options, setOptions] = useState<SandboxOptions>({
    loadOnlySelected: false,
    debugOverlay: true,
    fakePlayer: false,
    testInventory: false
  })

  const inspectDevWorkspace = useCallback(async () => {
    if (!activeProject) {
      setDevWorkspace(null)
      return
    }
    const res = await window.studio.inspectDevWorkspace(activeProject.path)
    if (res.ok && res.data) setDevWorkspace(res.data)
  }, [activeProject])

  useEffect(() => {
    void inspectDevWorkspace()
  }, [inspectDevWorkspace])

  useEffect(() => {
    if (!activeProject || !runtimeRun?.logPath) {
      setRuntimeLog('')
      return
    }
    let cancelled = false
    const read = async (): Promise<void> => {
      const res = await window.studio.readDevTaskLog(activeProject.path, runtimeRun.logPath!)
      if (!cancelled && res.ok && res.data !== undefined) setRuntimeLog(res.data)
    }
    void read()
    const interval = window.setInterval(() => { void read() }, runtimeRun.status === 'started' ? 1000 : 3000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeProject, runtimeRun?.logPath, runtimeRun?.status])

  const toggleOption = (key: keyof SandboxOptions): void => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const launch = async (): Promise<void> => {
    if (!activeProject || !workspaceDir) return
    setRunning(true)
    setError('')
    setResult(null)
    const res = await window.studio.runSandbox(activeProject.path, workspaceDir, profile, options)
    setRunning(false)
    if (res.ok && res.data) {
      setResult(res.data)
    } else {
      setError(res.error || 'Sandbox run failed.')
    }
  }

  const launchRuntime = async (taskId: DevTaskId): Promise<void> => {
    if (!activeProject) return
    const disabledReason = runtimeDisabledReason(taskId)
    if (disabledReason) {
      setError(disabledReason)
      return
    }
    setRuntimeBusy(true)
    setRuntimeRun(null)
    setRuntimeLog('')
    setError('')
    const res = await window.studio.runDevTask(activeProject.path, taskId)
    setRuntimeBusy(false)
    if (res.ok && res.data) {
      setRuntimeRun(res.data)
      toast(`${taskId} ${res.data.status}`)
      void inspectDevWorkspace()
    } else {
      setError(res.error || `${taskId} failed.`)
    }
  }

  const stopRuntime = async (): Promise<void> => {
    if (!activeProject || !runtimeRun?.logPath) return
    setRuntimeStopping(true)
    const res = await window.studio.stopDevTask(activeProject.path, runtimeRun.logPath)
    setRuntimeStopping(false)
    if (res.ok && res.data) {
      const stop = res.data
      setRuntimeRun((current) =>
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
      if (log.ok && log.data !== undefined) setRuntimeLog(log.data)
      toast(stop.message)
      void inspectDevWorkspace()
    } else {
      setError(res.error || 'Unable to stop runtime task.')
    }
  }

  const runtimeDisabledReason = (taskId: DevTaskId): string | null => {
    if (!activeProject) return 'Select a project first.'
    if (!devWorkspace) return 'Inspecting workspace.'
    if (!devWorkspace.gradleReady) return 'Set up a Gradle workspace first.'
    if (!devWorkspace.toolchain.javaAvailable) return `Install Java ${devWorkspace.toolchain.requiredJavaVersion} or add it to PATH.`
    if (!devWorkspace.toolchain.javaMeetsRequirement) return `Use Java ${devWorkspace.toolchain.requiredJavaVersion} for this generated workspace.`
    if (!devWorkspace.toolchain.gradleAvailable) return 'Run Dev Workspace setup to generate the pinned Gradle launcher or install Gradle.'
    if (taskId === 'gradle:runClient' && !devWorkspace.runtimeTargets.includes('neoforge')) return 'Enable NeoForge and run setup.'
    if (taskId === 'gradle:runServer' && !devWorkspace.runtimeTargets.includes('neoforge')) return 'Enable NeoForge and run setup.'
    if (taskId === 'preview:native' && !devWorkspace.runtimeTargets.includes('echo_native')) return 'Enable ECHO Native and run setup.'
    if (taskId === 'preview:standalone' && !devWorkspace.runtimeTargets.includes('standalone')) return 'Enable Standalone Runtime and run setup.'
    if (taskId === 'preview:native' && !devWorkspace.runtimeLaunchers.nativeConfigured) return 'Set ECHO Native executable in Settings and run setup.'
    if (taskId === 'preview:standalone' && !devWorkspace.runtimeLaunchers.standaloneConfigured) return 'Set Standalone executable in Settings and run setup.'
    return null
  }

  const scoreColor = (score: number): string => {
    if (score >= 80) return 'var(--good)'
    if (score >= 50) return 'var(--warn)'
    return 'var(--bad)'
  }

  const collectLogs = (): void => {
    if (!result) return
    const text = result.logs.map((log) => `[${log.time}] [${log.level}] ${log.message}`).join('\n')
    navigator.clipboard.writeText(text).then(() => toast('Logs copied to clipboard'))
  }

  const askAi = (): void => {
    if (!result || result.errors.length === 0) return
    const errorText = result.errors.join('\n')
    const prompt = `My addon failed sandbox testing with these errors:\n${errorText}\n\nCan you explain what went wrong and how to fix it?`
    nav('/codex', { state: { prefilled: prompt } })
  }

  const gradleValue = devWorkspace
    ? devWorkspace.gradleReady
      ? devWorkspace.hasGradleWrapper ? 'Pinned Launcher' : 'Project Files'
      : 'Missing'
    : '...'
  const toolchainReady = Boolean(devWorkspace?.toolchain.javaMeetsRequirement && devWorkspace.toolchain.gradleAvailable)
  const toolchainValue = devWorkspace
    ? toolchainReady
      ? 'Ready'
      : !devWorkspace.toolchain.javaAvailable
        ? 'Java Missing'
        : !devWorkspace.toolchain.javaMeetsRequirement
          ? `Java ${devWorkspace.toolchain.requiredJavaVersion} Needed`
          : 'Gradle Missing'
    : '...'
  const launcherValue = devWorkspace
    ? devWorkspace.runtimeLaunchers.ready ? 'Ready' : 'Needs Path'
    : '...'

  const taskStatusClass = (status: DevTaskRun['status']): string => {
    if (status === 'failed') return 'fixes'
    if (status === 'started' || status === 'stopped') return 'local'
    return 'ready'
  }

  if (!activeProject) {
    return (
      <Page title="Preview" subtitle="Test runtime profiles, dependency loading, content registration, runtime launches, and log output before packaging.">
        <NoProject />
      </Page>
    )
  }

  return (
    <Page
      title="Preview"
      subtitle="Test runtime profiles, dependency loading, content registration, runtime launches, and log output before packaging."
      actions={
        <>
          <button className="btn" disabled={running || !activeProject} onClick={launch}>
            {running ? 'Running...' : 'Run Quick Test'}
          </button>
          <button className="btn primary" disabled={running || !activeProject} onClick={launch}>
            {running ? 'Running...' : 'Launch Sandbox'}
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Metric label="Workspace" value={devWorkspace?.ready ? 'Ready' : 'Needs Setup'} tone={devWorkspace?.ready ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Gradle" value={gradleValue} tone={devWorkspace?.gradleReady ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Toolchain" value={toolchainValue} tone={toolchainReady ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Launchers" value={launcherValue} tone={devWorkspace?.runtimeLaunchers.ready ? 'var(--good)' : 'var(--warn)'} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Sandbox Profile</h3>
          <label className="field">
            <span>Target profile</span>
            <select value={profile} onChange={(event) => setProfile(event.target.value)}>
              {PROFILES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {([
            { key: 'loadOnlySelected', label: 'Load only selected addon' },
            { key: 'debugOverlay', label: 'Enable debug overlay' },
            { key: 'fakePlayer', label: 'Enable fake player profile' },
            { key: 'testInventory', label: 'Enable test inventory' }
          ] as { key: keyof SandboxOptions; label: string }[]).map((field) => (
            <label className="checkbox" key={field.key}>
              <input
                type="checkbox"
                checked={options[field.key]}
                onChange={() => toggleOption(field.key)}
              />
              {field.label}
            </label>
          ))}
        </div>
        <div className="card">
          <h3>Result Summary</h3>
          {result ? (
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>
                Compatibility score: <b style={{ color: scoreColor(result.compatibilityScore) }}>{result.compatibilityScore}%</b>
              </div>
              <div>Missing dependencies: <b>{result.missingDependencies.length}</b></div>
              <div>
                Warnings: <b style={{ color: result.warnings.length > 0 ? 'var(--warn)' : 'inherit' }}>{result.warnings.length}</b>
              </div>
              <div>
                Errors: <b style={{ color: result.errors.length > 0 ? 'var(--bad)' : 'inherit' }}>{result.errors.length}</b>
              </div>
              <div>Content loaded: <b>{result.contentLoaded}</b></div>
              <div>Content failed: <b>{result.contentFailed}</b></div>
            </div>
          ) : (
            <div className="dim" style={{ fontSize: 13 }}>Run the sandbox to see results.</div>
          )}
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn ghost" disabled={!result} onClick={collectLogs}>
              Collect Logs
            </button>
            <button className="btn ghost" disabled={!result || result.errors.length === 0} onClick={askAi}>
              Ask AI to Explain Crash
            </button>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Runtime Launchers</h3>
          <div className="grid cols-2" style={{ gap: 8 }}>
            {RUNTIME_TASKS.map((taskId) => {
              const task = DEV_TASKS.find((item) => item.id === taskId)
              if (!task) return null
              const disabledReason = runtimeDisabledReason(task.id)
              return (
                <button
                  key={task.id}
                  className="tile"
                  style={{ textAlign: 'left', padding: 12 }}
                  disabled={runtimeBusy || Boolean(disabledReason)}
                  onClick={() => launchRuntime(task.id)}
                >
                  <h4>{task.label}</h4>
                  <p>{disabledReason ?? task.description}</p>
                  <span className={`badge ${disabledReason ? 'local' : 'ready'}`}>
                    {disabledReason ? 'Unavailable' : task.command}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => nav('/dev-workspace')}>
              Open Dev Workspace
            </button>
            {runtimeRun?.status === 'started' && runtimeRun.logPath && (
              <button className="btn" disabled={runtimeStopping} onClick={stopRuntime}>
                {runtimeStopping ? 'Stopping...' : 'Stop Runtime'}
              </button>
            )}
            {runtimeRun?.logPath && (
              <button className="btn ghost" onClick={() => window.studio.openPath(runtimeRun.logPath!)}>
                Open Runtime Log
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Runtime Log</h3>
          {runtimeRun && (
            <div className="btn-row" style={{ marginBottom: 10 }}>
              <span className={`badge ${taskStatusClass(runtimeRun.status)}`}>{runtimeRun.status}</span>
              <span className="badge">{runtimeRun.command}</span>
              {runtimeRun.pid && <span className="badge">pid {runtimeRun.pid}</span>}
            </div>
          )}
          <div className="code" style={{ minHeight: 180, maxHeight: 280, whiteSpace: 'pre-wrap' }}>
            {runtimeLog || runtimeRun?.stdout || 'Launch a runtime target to stream logs here.'}
          </div>
        </div>
      </div>

      {error && <div className="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card">
        <h3>Sandbox Output</h3>
        <div className="code" style={{ minHeight: 180, whiteSpace: 'pre-wrap' }}>
          {result ? (
            result.logs.map((log, index) => (
              <div key={index} style={{ color: log.level === 'error' ? 'var(--bad)' : log.level === 'warn' ? 'var(--warn)' : log.level === 'ok' ? 'var(--good)' : 'inherit' }}>
                [{log.level}] {log.message}
              </div>
            ))
          ) : (
            <span className="dim">Sandbox idle. Launch to see logs.</span>
          )}
        </div>
      </div>

      {result && result.warnings.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Warnings</h3>
          {result.warnings.map((warning, index) => (
            <div key={index} className="dim" style={{ fontSize: 13, marginBottom: 4 }}>
              Warning: {warning}
            </div>
          ))}
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--bad)' }}>
          <h3>Errors</h3>
          {result.errors.map((item, index) => (
            <div key={index} style={{ fontSize: 13, marginBottom: 4, color: 'var(--bad)' }}>
              Error: {item}
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ fontSize: 20, color: tone ?? 'var(--accent)' }}>
        {value}
      </div>
    </div>
  )
}
