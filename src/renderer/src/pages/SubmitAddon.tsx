import { useCallback, useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { PackageResult } from '@shared/publishing'
import type { DevWorkspaceState } from '@shared/devWorkspace'
import type { PackOSReport } from '@shared/types'
import { RELEASE_SUBMISSION_TARGETS, type SubmissionState } from '@shared/publishing'

const STEPS = [
  'Readiness',
  'Artifacts',
  'Release Notes',
  'Changelog',
  'Permissions',
  'Index Target',
  'Handoff'
]

export default function SubmitAddon(): JSX.Element {
  const { activeProject, refresh, toast } = useWorkspace()
  const [sub, setSub] = useState<SubmissionState | null>(null)
  const [pkg, setPkg] = useState<PackageResult | null>(null)
  const [workspace, setWorkspace] = useState<DevWorkspaceState | null>(null)
  const [preflight, setPreflight] = useState<PackOSReport | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [readinessLoading, setReadinessLoading] = useState(false)

  const refreshReadiness = useCallback(async () => {
    if (!activeProject) {
      setWorkspace(null)
      setPreflight(null)
      return
    }
    setReadinessLoading(true)
    const [workspaceResult, checkResult] = await Promise.all([
      window.studio.inspectDevWorkspace(activeProject.path),
      window.studio.fullCheck(activeProject.path)
    ])
    setReadinessLoading(false)
    setWorkspace(workspaceResult.ok && workspaceResult.data ? workspaceResult.data : null)
    setPreflight(checkResult.ok && checkResult.data ? checkResult.data : null)
  }, [activeProject])

  useEffect(() => {
    if (!activeProject) {
      setSub(null)
      setPkg(null)
      return
    }
    window.studio.getSubmission(activeProject.path).then((r) => r.ok && setSub(r.data!))
  }, [activeProject])

  useEffect(() => {
    void refreshReadiness()
  }, [refreshReadiness])

  if (!activeProject)
    return (
      <Page title="Release Submission" subtitle="Review generated Release Index handoff assets before ingestion.">
        <NoProject />
      </Page>
    )
  if (!sub) return <Page title="Release Submission"><div className="empty">Loading...</div></Page>

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
      setPreflight(res.data.report)
      persist({ ...sub, lastHash: res.data.hash })
      await refreshReadiness()
      toast('Prepared release handoff')
    } else toast(res.error || 'Package failed')
  }

  const submit = async (): Promise<void> => {
    const next: SubmissionState = {
      ...sub,
      status: 'submitted',
      submittedAt: Date.now(),
      thread: [
        ...sub.thread,
        { from: 'creator', text: 'Release Index handoff marked ready for ingestion review.', at: Date.now() }
      ]
    }
    persist(next)
    await window.studio.setPublishStatus(activeProject.path, 'submitted')
    await refresh()
    toast('Release handoff marked ready')
    setStep(STEPS.length - 1)
  }

  const readinessReport = pkg?.report ?? preflight
  const ready = readinessReport?.publishingReady ?? false
  const sdkReady = pkg?.sdkValidation.ok ?? false
  const releaseSidecarsReady = Boolean(
    pkg?.checksumsPath &&
    pkg.packageManifestPath &&
    pkg.releaseManifestPath &&
    pkg.releaseIndexHandoffPath &&
    pkg.releaseIndexSubmissionPath &&
    pkg.releaseDraftPath
  )
  const handoffReady = Boolean(
    releaseSidecarsReady &&
    pkg?.releaseIndexHandoff?.schemaVersion === 'echo.release.index.handoff.v1' &&
    pkg.releaseIndexHandoff.targetRepository === 'knoxhack/ECHO-Release-Index' &&
    pkg.releaseIndexHandoff.targetCollection === 'addons' &&
    pkg.releaseIndexHandoff.entryFileName
  )
  const attestationSubjectCount = pkg?.releaseIndexHandoff?.attestation.subjects.length ?? 0
  const attestationReady = Boolean(
    pkg?.releaseIndexHandoff?.attestation.provider === 'github-artifact-attestations' &&
    pkg.releaseIndexHandoff.attestation.requireDigestMatch &&
    attestationSubjectCount > 0
  )
  const blockedModules = workspace?.modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked') ?? []
  const moduleReady = Boolean(
    workspace &&
    workspace.moduleLock.upToDate &&
    workspace.moduleWorkspace.upToDate &&
    workspace.modulePlan.missingRequired.length === 0 &&
    workspace.modulePlan.unknown.length === 0 &&
    blockedModules.length === 0
  )
  const canSubmit = sdkReady && ready && moduleReady && handoffReady && attestationReady && sub.permissionsConfirmed

  return (
    <Page title="Release Submission" subtitle="Review the local package, Release Index handoff, submission notes, permissions, and ingestion target.">
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
            <h3>Release Readiness</h3>
            <button className="btn" disabled={busy} onClick={runPackage}>
              {busy ? 'Running...' : 'Prepare Handoff'}
            </button>
            {pkg && (
              <div style={{ marginTop: 12 }}>
                <div className="metric" style={{ color: sdkReady && ready ? 'var(--good)' : 'var(--bad)' }}>
                  {readinessReport?.compatibilityScore ?? pkg.report.compatibilityScore}%
                </div>
                <div className="sub">
                  {ready ? 'PackOS ready for ingestion review' : `Blockers ${readinessReport?.counts.BLOCKER ?? pkg.report.counts.BLOCKER} - Errors ${readinessReport?.counts.ERROR ?? pkg.report.counts.ERROR}`}
                </div>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <span className={`badge ${sdkReady ? 'ready' : 'fixes'}`}>{sdkReady ? 'Package contract ready' : 'Package contract issues'}</span>
                  <span className={`badge ${moduleReady ? 'ready' : 'local'}`}>{moduleReady ? 'Modules current' : 'Modules need sync'}</span>
                  <span className={`badge ${handoffReady ? 'ready' : 'local'}`}>{handoffReady ? 'Handoff ready' : 'Handoff missing'}</span>
                  <span className={`badge ${attestationReady ? 'ready' : 'local'}`}>{attestationReady ? 'Attestation planned' : 'Attestation missing'}</span>
                </div>
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn ghost" disabled={readinessLoading} onClick={refreshReadiness}>
                {readinessLoading ? 'Checking...' : 'Refresh Readiness'}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <h3>Release Artifacts</h3>
            {pkg ? (
              <div style={{ fontSize: 13, lineHeight: 2 }}>
                <div className="mono" style={{ wordBreak: 'break-all' }}>{pkg.zipPath}</div>
                <div>Size: {(pkg.bytes / 1024).toFixed(1)} KB</div>
                <div>Package Contract: {pkg.sdkValidation.ok ? 'Ready' : `${pkg.sdkValidation.issues.length} issue(s)`}</div>
                <div>Built Assets: {pkg.assetPaths.length}</div>
                <div>Release Index: {pkg.releaseIndexHandoff?.entryFileName ?? 'Missing handoff'}</div>
                <div>Attestation subjects: {attestationSubjectCount}</div>
                <div className="mono faint" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  sha256: {pkg.hash}
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn ghost" onClick={() => window.studio.openPath(pkg.zipPath.replace(/[\\/][^\\/]+$/, ''))}>
                    Open exports folder
                  </button>
                  {pkg.releaseIndexHandoffPath && (
                    <button className="btn ghost" onClick={() => window.studio.openPath(pkg.releaseIndexHandoffPath!)}>
                      Open Handoff
                    </button>
                  )}
                  {pkg.releaseIndexSubmissionPath && (
                    <button className="btn ghost" onClick={() => window.studio.openPath(pkg.releaseIndexSubmissionPath!)}>
                      Open Notes
                    </button>
                  )}
                  {pkg.releaseDraftPath && (
                    <button className="btn ghost" onClick={() => window.studio.openPath(pkg.releaseDraftPath!)}>
                      Open Draft JSON
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button className="btn primary" disabled={busy} onClick={runPackage}>
                {busy ? 'Packaging...' : 'Prepare Release Assets'}
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <h3>Release Notes</h3>
            <label className="field">
              <span>Reviewer summary</span>
              <textarea value={sub.description} onChange={(e) => up({ description: e.target.value })} onBlur={() => persist(sub)} />
            </label>
            <label className="field">
              <span>Evidence paths (comma-separated)</span>
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
              Confirm your project only requests safe public permissions and does not require private runtime access.
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
            <h3>Select Ingestion Target</h3>
            <label className="field">
              <span>Target</span>
              <select value={sub.target} onChange={(e) => persist({ ...sub, target: e.target.value })}>
                {RELEASE_SUBMISSION_TARGETS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 6 && (
          <div className="card">
            <h3>Release Index Handoff</h3>
            <button
              className="btn primary"
              disabled={!canSubmit}
              onClick={submit}
            >
              Mark Handoff Ready
            </button>
            {!sdkReady && <p className="fix" style={{ color: 'var(--warn)' }}>Package must pass package contract validation first.</p>}
            {sdkReady && !ready && <p className="fix" style={{ color: 'var(--warn)' }}>Package must pass PackOS before ingestion.</p>}
            {!moduleReady && <p className="fix" style={{ color: 'var(--warn)' }}>Refresh Dev Workspace so module lock, workspace map, dependencies, and trust state are current.</p>}
            {!releaseSidecarsReady && <p className="fix" style={{ color: 'var(--warn)' }}>Prepare release assets so checksums, package manifest, release manifest, handoff JSON, submission notes, and draft metadata exist.</p>}
            {releaseSidecarsReady && !handoffReady && <p className="fix" style={{ color: 'var(--warn)' }}>Release Index handoff metadata is incomplete or targets the wrong collection.</p>}
            {!attestationReady && <p className="fix" style={{ color: 'var(--warn)' }}>Artifact attestation subjects must be generated before marking the handoff ready.</p>}
            {!sub.permissionsConfirmed && <p className="fix" style={{ color: 'var(--warn)' }}>Confirm permissions before marking the handoff ready.</p>}
          </div>
        )}

        <div className="card">
          <h3>Status &amp; Handoff Notes</h3>
          <span className="badge community">{sub.status}</span>
          <p className="dim" style={{ fontSize: 12 }}>
            Target: {sub.target}. Package hash: {sub.lastHash ?? 'not prepared'}.
          </p>
          <div className="grid cols-2" style={{ gap: 8, marginTop: 10 }}>
            <MiniStatus label="PackOS" ready={ready} detail={readinessReport ? `${readinessReport.counts.BLOCKER} blocker / ${readinessReport.counts.ERROR} error` : 'Not checked'} />
            <MiniStatus label="Modules" ready={moduleReady} detail={workspace ? `${workspace.modulePlan.closure.length} resolved` : 'Not inspected'} />
            <MiniStatus label="Sidecars" ready={releaseSidecarsReady} detail={releaseSidecarsReady ? 'Generated' : 'Missing'} />
            <MiniStatus label="Attestation" ready={attestationReady} detail={attestationSubjectCount ? `${attestationSubjectCount} subject(s)` : 'Missing'} />
          </div>
          {workspace && !moduleReady && (
            <div className="issue WARNING" style={{ marginTop: 12 }}>
              <span className="lvl">MODULES</span>
              {!workspace.moduleLock.upToDate && 'Module lock is stale. '}
              {!workspace.moduleWorkspace.upToDate && 'Module workspace map is stale. '}
              {workspace.modulePlan.missingRequired.length > 0 && `Missing closure: ${workspace.modulePlan.missingRequired.map((mod) => mod.name).join(', ')}. `}
              {workspace.modulePlan.unknown.length > 0 && `Unknown: ${workspace.modulePlan.unknown.join(', ')}. `}
              {blockedModules.length > 0 && `Blocked: ${blockedModules.map((mod) => mod.name).join(', ')}.`}
            </div>
          )}
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
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        <button className="btn primary" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>Next</button>
      </div>
    </Page>
  )
}

function MiniStatus({ label, ready, detail }: { label: string; ready: boolean; detail: string }): JSX.Element {
  return (
    <div className="tile" style={{ minHeight: 68 }}>
      <h4>{label}</h4>
      <p style={{ margin: 0, color: ready ? 'var(--good)' : 'var(--warn)' }}>{detail}</p>
    </div>
  )
}
