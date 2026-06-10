import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LocalLoopPanel } from '../components/LocalLoopPanel'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { editorLabelForProjectFile, editorRouteForProjectFile } from '@shared/content/routes'
import { buildLocalLoopStatus } from '@shared/localLoop'
import type { CodexTask } from '@shared/codexTasks'
import type { DevWorkspaceState } from '@shared/devWorkspace'
import type { ValidationReport } from '@shared/types'

export default function Validation(): JSX.Element {
  const { activeProject } = useWorkspace()
  const nav = useNavigate()
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [devWorkspace, setDevWorkspace] = useState<DevWorkspaceState | null>(null)
  const [loading, setLoading] = useState(false)
  const [codexTasks, setCodexTasks] = useState<CodexTask[]>([])

  const run = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const [res, tasks, workspace] = await Promise.all([
      window.studio.validateProject(activeProject.path),
      window.studio.listCodexTasks(activeProject.path),
      window.studio.inspectDevWorkspace(activeProject.path)
    ])
    setLoading(false)
    if (res.ok && res.data) setReport(res.data)
    if (tasks.ok && tasks.data) setCodexTasks(tasks.data)
    setDevWorkspace(workspace.ok && workspace.data ? workspace.data : null)
  }, [activeProject])

  useEffect(() => {
    run()
  }, [run])

  if (!activeProject)
    return (
      <Page title="Validation" subtitle="Contracts, modules, content references, assets, runtime compatibility, and release readiness.">
        <NoProject />
      </Page>
    )
  if (!report)
    return (
      <Page title="Validation">
        <div className="empty">{loading ? 'Inspecting validation, module closure, workspace, and release artifacts...' : 'Preparing validation report...'}</div>
      </Page>
    )

  const openCodexTask = (selectedTaskId?: string): void => {
    nav('/codex', selectedTaskId ? { state: { selectedTaskId } } : undefined)
  }

  const hs = report.healthScore
  const reviewableCodexTasks = codexTasks.filter((task) => task.lane !== 'rejected')
  const manifestFixAvailable = Boolean(codexTasks.some((task) => task.id === 'manifest:validation-autofix' && task.lane !== 'rejected'))
  const aiFixableCount = report.issues.filter((issue) => issue.aiFixable).length
  const localLoop = buildLocalLoopStatus({
    hasProject: true,
    validationReport: report,
    devWorkspace
  })
  const openIssueFile = (file: string): void => {
    nav(editorRouteForProjectFile(file))
  }
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
            disabled={!manifestFixAvailable}
            onClick={() => openCodexTask('manifest:validation-autofix')}
          >
            Review Manifest Fix
          </button>
          <button className="btn" disabled={reviewableCodexTasks.length === 0} onClick={() => openCodexTask()}>
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

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <LocalLoopPanel title="Local Loop Readiness" steps={localLoop.steps} nextStep={localLoop.nextStep} onNavigate={nav} />

        <div className="card">
          <h3>Artifact Health</h3>
          <div className="score-ring" style={{ color: hs.assets >= 80 ? 'var(--good)' : hs.assets >= 60 ? 'var(--warn)' : 'var(--bad)' }}>
            {hs.assets}%
          </div>
          <div className="bar" style={{ marginTop: 8 }}>
            <span style={{ width: `${hs.assets}%` }} />
          </div>
          <p className="dim" style={{ fontSize: 13 }}>
            Validation treats local release artifacts as ready only when runtime packages and Release Index sidecars are present.
          </p>
          {devWorkspace?.artifacts.length ? (
            <div className="btn-row">
              {devWorkspace.artifacts.slice(0, 8).map((artifact) => (
                <span className={`badge ${artifact.kind === 'checksum' || artifact.kind === 'manifest' ? 'ready' : 'local'}`} key={artifact.path}>
                  {artifact.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="dim" style={{ fontSize: 12 }}>No local artifacts found yet.</p>
          )}
        </div>
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
            <button className="btn primary" disabled={reviewableCodexTasks.length === 0} onClick={() => openCodexTask()}>
              Review Codex Tasks
            </button>
            {manifestFixAvailable && (
              <button className="btn ghost" onClick={() => openCodexTask('manifest:validation-autofix')}>
                Review Manifest Fix
              </button>
            )}
          </div>
        </div>
      )}

      {report.issues.length === 0 ? (
        <div className="card">
          <p className="dim" style={{ margin: 0 }}>
            No issues found. This project passes validation.
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
                <button className="btn ghost" onClick={() => openCodexTask()}>
                  Review Codex Fix
                </button>
              )}
              {issue.file && (
                <button className="btn ghost" onClick={() => openIssueFile(issue.file!)}>
                  Open {editorLabelForProjectFile(issue.file)}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </Page>
  )
}
