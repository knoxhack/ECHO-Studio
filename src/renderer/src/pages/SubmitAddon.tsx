import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { PackageResult } from '@shared/publishing'
import type { SubmissionState } from '@shared/publishing'

const STEPS = [
  'PackOS Check',
  'Package',
  'Metadata',
  'Changelog',
  'Permissions',
  'Catalog',
  'Submit'
]
const TARGETS = ['Community Catalog', 'Verified Addon Review', 'Private Unlisted Share', 'Server Pack Submission']

export default function SubmitAddon(): JSX.Element {
  const { activeProject, refresh, toast } = useWorkspace()
  const [sub, setSub] = useState<SubmissionState | null>(null)
  const [pkg, setPkg] = useState<PackageResult | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!activeProject) {
      setSub(null)
      return
    }
    window.studio.getSubmission(activeProject.path).then((r) => r.ok && setSub(r.data!))
  }, [activeProject])

  if (!activeProject)
    return (
      <Page title="Submit Addon" subtitle="Package, validate and submit your addon for review.">
        <NoProject />
      </Page>
    )
  if (!sub) return <Page title="Submit Addon"><div className="empty">Loading…</div></Page>

  const up = (patch: Partial<SubmissionState>): void => setSub((s) => (s ? { ...s, ...patch } : s))
  const persist = (next: SubmissionState): void => {
    setSub(next)
    window.studio.saveSubmission(activeProject.path, next)
  }

  const runPackage = async (): Promise<void> => {
    setBusy(true)
    const res = await window.studio.packageAddon(activeProject.path)
    setBusy(false)
    if (res.ok && res.data) {
      setPkg(res.data)
      persist({ ...sub, lastHash: res.data.hash })
      toast('Packaged addon')
    } else toast(res.error || 'Package failed')
  }

  const submit = async (): Promise<void> => {
    const next: SubmissionState = {
      ...sub,
      status: 'submitted',
      submittedAt: Date.now(),
      thread: [
        ...sub.thread,
        { from: 'reviewer', text: 'Submission received. Automated validation in progress…', at: Date.now() }
      ]
    }
    persist(next)
    await window.studio.setPublishStatus(activeProject.path, 'submitted')
    await refresh()
    toast('Submitted for review')
    setStep(STEPS.length - 1)
  }

  const ready = pkg?.report.publishingReady ?? false

  return (
    <Page title="Submit Addon" subtitle="Validate, package, add metadata and submit.">
      <ActiveBar />
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`} onClick={() => setStep(i)} style={{ cursor: 'pointer' }}>
            <b>{i + 1}</b>
            {s}
          </div>
        ))}
      </div>

      <div className="grid cols-2">
        {step === 0 && (
          <div className="card">
            <h3>Final PackOS Check</h3>
            <button className="btn" disabled={busy} onClick={runPackage}>
              {busy ? 'Running…' : 'Run Check & Package'}
            </button>
            {pkg && (
              <div style={{ marginTop: 12 }}>
                <div className="metric" style={{ color: ready ? 'var(--good)' : 'var(--bad)' }}>
                  {pkg.report.compatibilityScore}%
                </div>
                <div className="sub">
                  {ready ? 'Ready to submit' : `Blockers ${pkg.report.counts.BLOCKER} · Errors ${pkg.report.counts.ERROR}`}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <h3>Package</h3>
            {pkg ? (
              <div style={{ fontSize: 13, lineHeight: 2 }}>
                <div className="mono" style={{ wordBreak: 'break-all' }}>{pkg.zipPath}</div>
                <div>Size: {(pkg.bytes / 1024).toFixed(1)} KB</div>
                <div className="mono faint" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  sha256: {pkg.hash}
                </div>
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => window.studio.openPath(pkg.zipPath.replace(/[\\/][^\\/]+$/, ''))}>
                  Open exports folder
                </button>
              </div>
            ) : (
              <button className="btn primary" disabled={busy} onClick={runPackage}>
                {busy ? 'Packaging…' : 'Build Package'}
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <h3>Metadata</h3>
            <label className="field">
              <span>Description / summary</span>
              <textarea value={sub.description} onChange={(e) => up({ description: e.target.value })} onBlur={() => persist(sub)} />
            </label>
            <label className="field">
              <span>Screenshots (comma-separated paths)</span>
              <input
                value={sub.screenshots.join(', ')}
                onChange={(e) => up({ screenshots: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                onBlur={() => persist(sub)}
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <h3>Changelog</h3>
            <textarea
              style={{ minHeight: 160 }}
              value={sub.changelog}
              onChange={(e) => up({ changelog: e.target.value })}
              onBlur={() => persist(sub)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="card">
            <h3>Confirm Permissions</h3>
            <p className="dim" style={{ fontSize: 12 }}>
              Confirm your addon only requests safe community permissions.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={sub.permissionsConfirmed}
                onChange={(e) => persist({ ...sub, permissionsConfirmed: e.target.checked })}
              />
              I confirm the requested permissions are appropriate.
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="card">
            <h3>Select Catalog</h3>
            <label className="field">
              <span>Target catalog</span>
              <select value={sub.target} onChange={(e) => persist({ ...sub, target: e.target.value })}>
                {TARGETS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 6 && (
          <div className="card">
            <h3>Submit</h3>
            <button
              className="btn primary"
              disabled={!ready || !sub.permissionsConfirmed}
              onClick={submit}
            >
              Submit for Review
            </button>
            {!ready && <p className="fix" style={{ color: 'var(--warn)' }}>Package must pass PackOS first (step 1).</p>}
            {!sub.permissionsConfirmed && <p className="fix" style={{ color: 'var(--warn)' }}>Confirm permissions (step 5).</p>}
          </div>
        )}

        <div className="card">
          <h3>Status &amp; Review Thread</h3>
          <span className="badge community">{sub.status}</span>
          <div style={{ marginTop: 12 }}>
            {sub.thread.length === 0 && <p className="dim" style={{ fontSize: 12 }}>No messages yet.</p>}
            {sub.thread.map((t, i) => (
              <div key={i} className="chat-msg" style={{ maxWidth: '100%' }}>
                <div className="chat-bubble">
                  <b className="dim" style={{ fontSize: 11 }}>{t.from}</b>
                  <div>{t.text}</div>
                </div>
              </div>
            ))}
          </div>
          {sub.status === 'submitted' && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button
                className="btn ghost"
                onClick={() =>
                  persist({
                    ...sub,
                    status: 'changes_requested',
                    thread: [...sub.thread, { from: 'reviewer', text: 'Please add a support link and fix missing localization keys.', at: Date.now() }]
                  })
                }
              >
                Simulate Review Response
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        <button className="btn primary" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>Next</button>
      </div>
    </Page>
  )
}
