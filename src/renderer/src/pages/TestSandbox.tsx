import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { SandboxResult, SandboxOptions } from '@shared/sandbox'

const PROFILES = [
  'Ashfall Sandbox',
  'ECHO Prime Sandbox',
  'Arcana Sandbox',
  'Generic ECHO Runtime Sandbox',
  'Server Sandbox'
]

export default function TestSandbox(): JSX.Element {
  const { activeProject, workspaceDir, config, toast } = useWorkspace()
  const nav = useNavigate()
  const [profile, setProfile] = useState(config.sandbox?.defaultProfile || PROFILES[0])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SandboxResult | null>(null)
  const [error, setError] = useState('')
  const [options, setOptions] = useState<SandboxOptions>({
    loadOnlySelected: false,
    debugOverlay: true,
    fakePlayer: false,
    testInventory: false
  })

  const toggleOption = (key: keyof SandboxOptions) => {
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

  const scoreColor = (s: number) => {
    if (s >= 80) return 'var(--good)'
    if (s >= 50) return 'var(--warn)'
    return 'var(--bad)'
  }

  const collectLogs = () => {
    if (!result) return
    const text = result.logs.map((l) => `[${l.time}] [${l.level}] ${l.message}`).join('\n')
    navigator.clipboard.writeText(text).then(() => toast('Logs copied to clipboard'))
  }

  const askAi = () => {
    if (!result || result.errors.length === 0) return
    const errorText = result.errors.join('\n')
    const prompt = `My addon failed sandbox testing with these errors:\n${errorText}\n\nCan you explain what went wrong and how to fix it?`
    nav('/ai', { state: { prefilled: prompt } })
  }

  return (
    <Page
      title="Test Sandbox"
      subtitle="Safely test your addon in an isolated ECHO runtime profile."
      actions={
        <>
          <button className="btn" disabled={running || !activeProject} onClick={launch}>
            {running ? 'Running…' : 'Run Quick Test'}
          </button>
          <button className="btn primary" disabled={running || !activeProject} onClick={launch}>
            {running ? 'Running…' : 'Launch Sandbox'}
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Sandbox Profile</h3>
          <label className="field">
            <span>Target profile</span>
            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
              {PROFILES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          {([
            { key: 'loadOnlySelected', label: 'Load only selected addon' },
            { key: 'debugOverlay', label: 'Enable debug overlay' },
            { key: 'fakePlayer', label: 'Enable fake player profile' },
            { key: 'testInventory', label: 'Enable test inventory' }
          ] as { key: keyof SandboxOptions; label: string }[]).map((f) => (
            <label className="checkbox" key={f.key}>
              <input
                type="checkbox"
                checked={options[f.key]}
                onChange={() => toggleOption(f.key)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="card">
          <h3>Result Summary</h3>
          {result ? (
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>
                Compatibility score:{" "}
                <b style={{ color: scoreColor(result.compatibilityScore) }}>
                  {result.compatibilityScore}%
                </b>
              </div>
              <div>Missing dependencies: <b>{result.missingDependencies.length}</b></div>
              <div>
                Warnings:{" "}
                <b style={{ color: result.warnings.length > 0 ? 'var(--warn)' : 'inherit' }}>
                  {result.warnings.length}
                </b>
              </div>
              <div>
                Errors:{" "}
                <b style={{ color: result.errors.length > 0 ? 'var(--bad)' : 'inherit' }}>
                  {result.errors.length}
                </b>
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

      {error && <div className="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card">
        <h3>Sandbox Output</h3>
        <div className="code" style={{ minHeight: 180, whiteSpace: 'pre-wrap' }}>
          {result ? (
            result.logs.map((l, i) => (
              <div key={i} style={{ color: l.level === 'error' ? 'var(--bad)' : l.level === 'warn' ? 'var(--warn)' : l.level === 'ok' ? 'var(--good)' : 'inherit' }}>
                [{l.level}] {l.message}
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
          {result.warnings.map((w, i) => (
            <div key={i} className="dim" style={{ fontSize: 13, marginBottom: 4 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--bad)' }}>
          <h3>Errors</h3>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 4, color: 'var(--bad)' }}>
              ✖ {e}
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}
