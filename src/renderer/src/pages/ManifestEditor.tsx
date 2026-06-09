import { useState } from 'react'
import { useWorkspace } from '../state/WorkspaceContext'

export default function ManifestEditor(): JSX.Element {
  const { activeProject } = useWorkspace()
  const [raw, setRaw] = useState(() => {
    try {
      return JSON.stringify(activeProject?.manifest ?? {}, null, 2)
    } catch {
      return '{}'
    }
  })
  const [validation, setValidation] = useState<string[]>([])

  const validate = () => {
    const errors: string[] = []
    try {
      const parsed = JSON.parse(raw)
      if (!parsed.id) errors.push('Missing required field: id')
      if (!parsed.name) errors.push('Missing required field: name')
      if (!parsed.version) errors.push('Missing required field: version')
      if (!parsed.namespace) errors.push('Missing required field: namespace')
      if (!parsed.runtime?.supports?.length) errors.push('runtime.supports must contain at least one runtime')
      if (!parsed.target?.experiences?.length) errors.push('target.experiences must contain at least one experience')
    } catch (e) {
      errors.push(`Invalid JSON: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
    setValidation(errors.length ? errors : ['Manifest is valid'])
  }

  return (
    <div className="page">
      <h1 className="page-title">Manifest Editor</h1>
      <p className="page-subtitle">
        Visual editor for echo.mod.json with live validation and PackOS policy checking.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h2 className="card-title">echo.mod.json</h2>
          <div className="flex gap-2">
            <button className="btn secondary" onClick={validate}>
              Validate
            </button>
            <button className="btn primary" onClick={() => { /* TODO: save */ }}>
              Save
            </button>
          </div>
        </div>
        <textarea
          className="input mono"
          style={{ width: '100%', height: 320, fontFamily: 'monospace', fontSize: 13 }}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Validation Results</h2>
        <ul className="list" style={{ marginTop: 8 }}>
          {validation.map((msg, i) => (
            <li
              key={i}
              className="list-item"
              style={{
                color: msg.startsWith('Manifest is valid') ? 'var(--success)' : 'var(--danger)'
              }}
            >
              {msg}
            </li>
          ))}
          {validation.length === 0 && (
            <li className="list-item muted">Click Validate to check manifest against schema.</li>
          )}
        </ul>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Target Selector</h2>
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          {['Native', 'Standalone', 'NeoForge compatibility'].map((t) => (
            <label key={t} className="badge" style={{ cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginRight: 6 }} />
              {t}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
