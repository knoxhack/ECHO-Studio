import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { autoFixManifest } from '@shared/validation'
import type { CodexTask } from '@shared/codexTasks'
import type { PackOSReport } from '@shared/types'

export default function PackOSCheck(): JSX.Element {
  const { activeProject, refresh, toast } = useWorkspace()
  const nav = useNavigate()
  const [report, setReport] = useState<PackOSReport | null>(null)
  const [fixing, setFixing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [codexTasks, setCodexTasks] = useState<CodexTask[]>([])

  const run = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const [res, tasks] = await Promise.all([
      window.studio.fullCheck(activeProject.path),
      window.studio.listCodexTasks(activeProject.path)
    ])
    setLoading(false)
    if (res.ok && res.data) setReport(res.data)
    if (tasks.ok && tasks.data) setCodexTasks(tasks.data)
  }, [activeProject])

  useEffect(() => {
    run()
  }, [run])

  if (!activeProject)
    return (
      <Page title="Validation" subtitle="PackOS, modules, content references, assets, runtime compatibility, and release readiness.">
        <NoProject />
      </Page>
    )
  if (!report)
    return (
      <Page title="Validation">
        <div className="empty">{loading ? 'Running checks...' : 'Preparing...'}</div>
      </Page>
    )

  const applyManifestFixes = async (): Promise<void> => {
    setFixing(true)
    const manifestRes = await window.studio.readManifest(activeProject.path)
    if (manifestRes.ok && manifestRes.data) {
      const fixed = autoFixManifest(manifestRes.data)
      await window.studio.writeManifest(activeProject.path, fixed)
      await refresh()
    }
    setFixing(false)
    toast('Applied manifest fixes')
    run()
  }

  const hs = report.healthScore
  const reviewableCodexTasks = codexTasks.filter((task) => task.lane !== 'rejected')
  const manifestFixAvailable = Boolean(codexTasks.some((task) => task.id === 'manifest:packos-autofix' && task.lane !== 'rejected'))
  const aiFixableCount = report.issues.filter((issue) => issue.aiFixable).length
  return (
    <Page
      title="Validation"
      subtitle="Full project validation: contracts, modules, content references, assets, runtime, local dev setup, and release readiness."
      actions={
        <>
          <button className="btn" disabled={loading} onClick={run}>
            {loading ? 'Checking...' : 'Re-run Check'}
          </button>
          <button
            className="btn primary"
            disabled={fixing || !manifestFixAvailable}
            onClick={applyManifestFixes}
          >
            {fixing ? 'Applying...' : 'Apply Manifest Fixes'}
          </button>
          <button className="btn" disabled={reviewableCodexTasks.length === 0} onClick={() => nav('/codex')}>
            Review Codex Fixes
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
            Blockers {report.counts.BLOCKER} - Errors {report.counts.ERROR}
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

      {aiFixableCount > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Reviewable Fixes</h3>
          <p className="dim" style={{ marginTop: 0 }}>
            {reviewableCodexTasks.length > 0
              ? `${reviewableCodexTasks.length} Codex task(s) are available for ${aiFixableCount} AI-fixable validation issue(s). Review diffs before applying content or workspace changes.`
              : `${aiFixableCount} issue(s) are marked AI-fixable. Re-run checks or open Codex Tasks to refresh repair proposals.`}
          </p>
          <div className="btn-row">
            <button className="btn primary" disabled={reviewableCodexTasks.length === 0} onClick={() => nav('/codex')}>
              Review Codex Tasks
            </button>
            {manifestFixAvailable && (
              <button className="btn ghost" disabled={fixing} onClick={applyManifestFixes}>
                Apply Manifest-Only Fix
              </button>
            )}
          </div>
        </div>
      )}

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
                <button className="btn ghost" onClick={() => nav('/codex')}>
                  Review Codex Fix
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
