import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { autoFixManifest } from '@shared/validation'
import type { PackOSReport } from '@shared/types'

export default function PackOSCheck(): JSX.Element {
  const { activeProject, refresh, toast } = useWorkspace()
  const nav = useNavigate()
  const [report, setReport] = useState<PackOSReport | null>(null)
  const [fixing, setFixing] = useState(false)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const res = await window.studio.fullCheck(activeProject.path)
    setLoading(false)
    if (res.ok && res.data) setReport(res.data)
  }, [activeProject])

  useEffect(() => {
    run()
  }, [run])

  if (!activeProject)
    return (
      <Page title="PackOS Check" subtitle="The core safety gate for community addons.">
        <NoProject />
      </Page>
    )
  if (!report)
    return (
      <Page title="PackOS Check">
        <div className="empty">{loading ? 'Running checks…' : 'Preparing…'}</div>
      </Page>
    )

  const fixAll = async (): Promise<void> => {
    setFixing(true)
    const manifestRes = await window.studio.readManifest(activeProject.path)
    if (manifestRes.ok && manifestRes.data) {
      const fixed = autoFixManifest(manifestRes.data)
      await window.studio.writeManifest(activeProject.path, fixed)
      await refresh()
    }
    setFixing(false)
    toast('Applied automatic manifest fixes')
    run()
  }

  const hs = report.healthScore
  return (
    <Page
      title="PackOS Check"
      subtitle="Full project validation: manifest, content references, assets, runtime and publishing."
      actions={
        <>
          <button className="btn" disabled={loading} onClick={run}>
            {loading ? 'Checking…' : 'Re-run Check'}
          </button>
          <button
            className="btn primary"
            disabled={fixing || (report.counts.BLOCKER === 0 && report.counts.ERROR === 0)}
            onClick={fixAll}
          >
            {fixing ? 'Fixing…' : 'Fix with AI'}
          </button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Compatibility Score</h3>
          <div
            className="score-ring"
            style={{ color: report.compatibilityScore >= 70 ? 'var(--good)' : 'var(--bad)' }}
          >
            {report.compatibilityScore}%
          </div>
          <div className="bar" style={{ marginTop: 8 }}>
            <span style={{ width: `${report.compatibilityScore}%` }} />
          </div>
        </div>
        <div className="card">
          <h3>Publishing Status</h3>
          <div
            className="metric"
            style={{ fontSize: 18, color: hs.publishing === 'Ready' ? 'var(--good)' : 'var(--warn)' }}
          >
            {hs.publishing}
          </div>
          <div className="sub">
            Blockers {report.counts.BLOCKER} · Errors {report.counts.ERROR}
          </div>
        </div>
        <div className="card">
          <h3>Permissions</h3>
          <div
            className="metric"
            style={{
              fontSize: 18,
              color:
                hs.permissions === 'Safe'
                  ? 'var(--good)'
                  : hs.permissions === 'Risky'
                    ? 'var(--warn)'
                    : 'var(--bad)'
            }}
          >
            {hs.permissions}
          </div>
        </div>
        <div className="card">
          <h3>Native Readiness</h3>
          <div className="metric" style={{ fontSize: 22 }}>
            {hs.nativeReadiness}%
          </div>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        {(['BLOCKER', 'ERROR', 'WARNING', 'SUGGESTION'] as const).map((lvl) => (
          <span key={lvl} className="badge">
            {lvl}: {report.counts[lvl]}
          </span>
        ))}
      </div>

      {report.issues.length === 0 ? (
        <div className="card">
          <p className="dim" style={{ margin: 0 }}>
            No issues found. This addon passes PackOS validation.
          </p>
        </div>
      ) : (
        report.issues.map((issue, i) => (
          <div className={`issue ${issue.level}`} key={i}>
            <div>
              <span className="lvl">{issue.level}</span>
              <span className="dim" style={{ fontSize: 11 }}>
                {issue.category}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>{issue.message}</div>
            {issue.fix && <div className="fix">Fix: {issue.fix}</div>}
            <div className="btn-row" style={{ marginTop: 8 }}>
              {issue.aiFixable && (
                <button className="btn ghost" onClick={fixAll}>
                  Fix with AI
                </button>
              )}
              {issue.file && (
                <button className="btn ghost" onClick={() => nav('/content')}>
                  Open in Content Builder
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </Page>
  )
}
