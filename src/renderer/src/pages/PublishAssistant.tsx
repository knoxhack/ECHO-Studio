import { useState } from 'react'

export default function PublishAssistant(): JSX.Element {
  const [step, setStep] = useState(0)
  const [owner, setOwner] = useState('knoxhack')
  const [repo, setRepo] = useState('')
  const [tag, setTag] = useState('v0.1.0')
  const [draft, setDraft] = useState(true)
  const [status, setStatus] = useState<string | null>(null)

  const steps = [
    'Validate addon package',
    'Generate checksums',
    'Prepare release assets',
    'Create GitHub Release draft',
  ]

  const runStep = () => {
    if (step < steps.length - 1) {
      setStatus(`Running: ${steps[step]}...`)
      setTimeout(() => {
        setStatus(`Completed: ${steps[step]}`)
        setStep((s) => s + 1)
      }, 600)
    } else {
      setStatus('Release draft prepared. Open GitHub to publish.')
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Publish Assistant</h1>
      <p className="page-subtitle">
        Prepare release assets, generate checksums, and create a GitHub Release draft.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Repository</h2>
        <div className="grid gap-2" style={{ marginTop: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 480 }}>
          <input className="input" placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <input className="input" placeholder="Repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <input className="input" placeholder="Tag (e.g. v0.1.0)" value={tag} onChange={(e) => setTag(e.target.value)} />
          <label className="badge">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} style={{ marginRight: 6 }} />
            Draft
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Progress</h2>
        <ol className="list" style={{ marginTop: 8 }}>
          {steps.map((s, i) => (
            <li key={s} className="list-item" style={{ opacity: i === step ? 1 : i < step ? 0.8 : 0.4 }}>
              <span style={{ display: 'inline-block', width: 20 }}>
                {i < step ? '✓' : i === step ? '▶' : '○'}
              </span>
              {s}
            </li>
          ))}
        </ol>
        {status && (
          <div className="badge" style={{ marginTop: 12, display: 'inline-block' }}>
            {status}
          </div>
        )}
        <div className="flex gap-2" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={runStep} disabled={step >= steps.length}>
            {step >= steps.length ? 'Done' : 'Next Step'}
          </button>
          <button className="btn secondary" onClick={() => { setStep(0); setStatus(null) }}>
            Reset
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Docs Links</h2>
        <ul className="list" style={{ marginTop: 8 }}>
          <li className="list-item">
            <a href="https://echo-platform.dev/docs/publishing" target="_blank" rel="noreferrer">
              Publishing Guide
            </a>
          </li>
          <li className="list-item">
            <a href="https://echo-platform.dev/docs/packos" target="_blank" rel="noreferrer">
              PackOS Validation Rules
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
