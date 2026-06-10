import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { findLabel } from '../nav'
import { editorTargetForProjectFile } from '@shared/content/routes'
import type { CodexTask, CodexTaskActionResult, CodexTaskLane } from '@shared/codexTasks'

const LANES: Array<{ id: CodexTaskLane; label: string }> = [
  { id: 'suggested', label: 'Suggested' },
  { id: 'waiting_review', label: 'Waiting Review' },
  { id: 'ready', label: 'Ready' },
  { id: 'rejected', label: 'Rejected' }
]

export default function CodexTasks(): JSX.Element {
  const { activeProject, toast, refresh } = useWorkspace()
  const nav = useNavigate()
  const [tasks, setTasks] = useState<CodexTask[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [lastAction, setLastAction] = useState<CodexTaskActionResult | null>(null)

  const load = useCallback(async () => {
    if (!activeProject) {
      setTasks([])
      setSelectedId(null)
      return
    }
    const result = await window.studio.listCodexTasks(activeProject.path)
    if (result.ok && result.data) {
      const nextTasks = result.data
      setTasks(nextTasks)
      setSelectedId((current) => current && nextTasks.some((task) => task.id === current)
        ? current
        : nextTasks[0]?.id ?? null)
      setStatus('')
    } else {
      setStatus(result.error || 'Could not load Codex tasks.')
    }
  }, [activeProject])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? tasks[0],
    [selectedId, tasks]
  )
  const selectedRouteLabel = selected ? findLabel(selected.route) || 'Area' : 'Area'

  if (!activeProject) {
    return (
      <Page title="Codex" subtitle="Task-based build assistance with review and approval gates.">
        <NoProject />
      </Page>
    )
  }

  const applyTask = async (task: CodexTask): Promise<void> => {
    setBusy(true)
    setStatus(`Applying ${task.title}...`)
    const result = await window.studio.applyCodexTask(activeProject.path, task.id)
    setBusy(false)
    if (result.ok && result.data) {
      setLastAction(result.data)
      toast(result.data.message)
      setStatus(`${result.data.message} ${result.data.filesChanged.length} file(s) changed.`)
      refresh()
      await load()
    } else {
      setStatus(result.error || `${task.title} failed.`)
    }
  }

  const rejectTask = async (task: CodexTask, rejected: boolean): Promise<void> => {
    setBusy(true)
    const result = await window.studio.rejectCodexTask(activeProject.path, task.id, rejected)
    setBusy(false)
    if (result.ok && result.data) {
      setLastAction(null)
      setTasks(result.data)
      setSelectedId(task.id)
      setStatus(rejected ? `${task.title} rejected.` : `${task.title} restored.`)
    } else {
      setStatus(result.error || 'Could not update task state.')
    }
  }

  return (
    <Page
      title="Codex"
      subtitle="Reviewable Studio tasks with diffs, validation impact, approval gates, and local build actions."
      actions={
        <>
          <button className="btn" disabled={busy} onClick={() => nav('/ai')}>Open Chat</button>
          <button className="btn" disabled={busy} onClick={load}>Refresh Tasks</button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {LANES.map((lane) => (
          <Metric
            key={lane.id}
            label={lane.label}
            value={String(tasks.filter((task) => task.lane === lane.id).length)}
            tone={lane.id === 'ready' ? 'var(--good)' : lane.id === 'waiting_review' ? 'var(--warn)' : undefined}
          />
        ))}
      </div>

      {status && (
        <div className="issue INFO" style={{ marginBottom: 16 }}>
          <span className="lvl">INFO</span>
          {status}
        </div>
      )}

      {lastAction && (
        <ActionResult result={lastAction} />
      )}

      <div className="split" style={{ gridTemplateColumns: 'minmax(340px, 0.95fr) minmax(420px, 1.35fr)', alignItems: 'start' }}>
        <div className="grid gap-2">
          {LANES.map((lane) => (
            <div className="card" key={lane.id}>
              <h3>{lane.label}</h3>
              {tasks.filter((task) => task.lane === lane.id).map((task) => (
                <button
                  key={task.id}
                  className={`tile ${selected?.id === task.id ? 'selected' : ''}`}
                  style={{ display: 'block', textAlign: 'left', marginBottom: 10, width: '100%' }}
                  onClick={() => setSelectedId(task.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h4 style={{ flex: 1 }}>{task.title}</h4>
                    <span className={`badge ${task.canApply ? 'ready' : 'local'}`}>
                      {task.canApply ? 'action' : 'review'}
                    </span>
                  </div>
                  <p>{task.reason}</p>
                </button>
              ))}
              {tasks.filter((task) => task.lane === lane.id).length === 0 && (
                <p className="dim" style={{ fontSize: 12 }}>No tasks in this lane.</p>
              )}
            </div>
          ))}
        </div>

        <div className="card" style={{ position: 'sticky', top: 0 }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ flex: 1 }}>{selected.title}</h2>
                <span className="badge">{selected.kind}</span>
              </div>
              <p className="dim" style={{ fontSize: 13 }}>{selected.summary}</p>

              <div className="grid cols-2" style={{ marginTop: 14, gap: 10 }}>
                <ValidationBox title="Before" snapshot={selected.validationBefore} />
                <ValidationBox title="After" snapshot={selected.validationAfter} />
              </div>

              <div className="section-title">Affected Surface</div>
              <div className="btn-row">
                {selected.affectedFiles.length ? (
                  selected.affectedFiles.map((file) => {
                    const target = editorTargetForProjectFile(file)
                    return (
                      <button
                        key={file}
                        className="badge badge-button"
                        title={`Open ${target.label}`}
                        onClick={() => nav(target.route)}
                      >
                        {file}
                      </button>
                    )
                  })
                ) : (
                  <span className="dim">No direct file change.</span>
                )}
              </div>

              {selected.fileChanges.length > 0 && (
                <>
                  <div className="section-title">Proposed Diff</div>
                  {selected.fileChanges.map((change) => (
                    <div key={change.path} style={{ marginBottom: 12 }}>
                      <div className="badge" style={{ marginBottom: 6 }}>{change.path}</div>
                      <div className="code" style={{ maxHeight: 360, whiteSpace: 'pre-wrap' }}>
                        {change.diff || 'No text diff.'}
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => nav(selected.route)}>Open {selectedRouteLabel}</button>
                {selected.canApply && selected.lane !== 'rejected' && (
                  <button className="btn primary" disabled={busy} onClick={() => applyTask(selected)}>
                    {selected.applyLabel ?? 'Apply'}
                  </button>
                )}
                {selected.lane === 'rejected' ? (
                  <button className="btn" disabled={busy} onClick={() => rejectTask(selected, false)}>Restore</button>
                ) : selected.rejectable && (
                  <button className="btn ghost" disabled={busy} onClick={() => rejectTask(selected, true)}>Reject</button>
                )}
              </div>
            </>
          ) : (
            <p className="dim">No Codex tasks are needed for this project right now.</p>
          )}
        </div>
      </div>
    </Page>
  )
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function parentPath(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, '')
}

function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function ActionResult({ result }: { result: CodexTaskActionResult }): JSX.Element {
  const packageResult = result.packageResult
  const devSetup = result.devSetup

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, flex: 1 }}>Last Applied Task</h3>
        <span className="badge ready">{result.taskId}</span>
      </div>
      <p className="dim" style={{ fontSize: 13 }}>
        {result.message}
      </p>

      {devSetup && (
        <div className="grid cols-2" style={{ marginTop: 10 }}>
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>Written</div>
            {devSetup.written.length ? (
              devSetup.written.slice(0, 8).map((file) => (
                <div className="list-row" key={file} style={{ padding: '7px 10px' }}>
                  <span className="badge ready">write</span>
                  <span className="mono" style={{ flex: 1 }}>{file}</span>
                </div>
              ))
            ) : (
              <p className="dim" style={{ fontSize: 12 }}>No files were written.</p>
            )}
          </div>
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>Skipped</div>
            {devSetup.skipped.length ? (
              devSetup.skipped.slice(0, 8).map((file) => (
                <div className="list-row" key={file} style={{ padding: '7px 10px' }}>
                  <span className="badge local">skip</span>
                  <span className="mono" style={{ flex: 1 }}>{file}</span>
                </div>
              ))
            ) : (
              <p className="dim" style={{ fontSize: 12 }}>No existing files were skipped.</p>
            )}
          </div>
        </div>
      )}

      {packageResult && (
        <>
          <div className="grid cols-4" style={{ marginTop: 12 }}>
            <Metric label="Package" value={formatBytes(packageResult.bytes)} tone="var(--good)" />
            <Metric label="Assets" value={String(packageResult.assetPaths.length)} tone={packageResult.assetPaths.length ? 'var(--good)' : 'var(--warn)'} />
            <Metric label="Validation" value={`${packageResult.report.compatibilityScore}%`} tone={packageResult.report.publishingReady ? 'var(--good)' : 'var(--warn)'} />
            <Metric label="Contract" value={packageResult.sdkValidation.ok ? 'Ready' : 'Issues'} tone={packageResult.sdkValidation.ok ? 'var(--good)' : 'var(--bad)'} />
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => window.studio.openPath(parentPath(packageResult.zipPath))}>
              Open Release Folder
            </button>
            {packageResult.releaseDraftPath && (
              <button className="btn ghost" onClick={() => window.studio.openPath(packageResult.releaseDraftPath!)}>
                Open Draft JSON
              </button>
            )}
            {packageResult.releaseManifestPath && (
              <button className="btn ghost" onClick={() => window.studio.openPath(packageResult.releaseManifestPath!)}>
                Open echo-release.json
              </button>
            )}
            {packageResult.releaseIndexHandoffPath && (
              <button className="btn ghost" onClick={() => window.studio.openPath(packageResult.releaseIndexHandoffPath!)}>
                Open Handoff
              </button>
            )}
            {packageResult.releaseIndexSubmissionPath && (
              <button className="btn ghost" onClick={() => window.studio.openPath(packageResult.releaseIndexSubmissionPath!)}>
                Open Review Notes
              </button>
            )}
          </div>
          <div className="section-title">Artifacts</div>
          {packageResult.assetPaths.map((artifact) => (
            <div className="list-row" key={artifact} style={{ padding: '7px 10px' }}>
              <span className="badge ready">artifact</span>
              <span className="mono" style={{ flex: 1 }}>{fileName(artifact)}</span>
            </div>
          ))}
        </>
      )}

      {!devSetup && !packageResult && result.filesChanged.length > 0 && (
        <>
          <div className="section-title">Changed Files</div>
          {result.filesChanged.map((file) => (
            <div className="list-row" key={file} style={{ padding: '7px 10px' }}>
              <span className="badge ready">changed</span>
              <span className="mono" style={{ flex: 1 }}>{file}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ color: tone ?? 'var(--accent)' }}>{value}</div>
    </div>
  )
}

function ValidationBox({ title, snapshot }: { title: string; snapshot?: CodexTask['validationBefore'] }): JSX.Element {
  if (!snapshot) {
    return (
      <div className="tile">
        <h4>{title}</h4>
        <p className="dim">Not applicable.</p>
      </div>
    )
  }
  return (
    <div className="tile">
      <h4>{title}</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span className="badge fixes">B {snapshot.blockers}</span>
        <span className="badge fixes">E {snapshot.errors}</span>
        <span className="badge local">W {snapshot.warnings}</span>
        <span className="badge">S {snapshot.suggestions}</span>
        <span className={`badge ${snapshot.publishingReady ? 'ready' : 'local'}`}>
          {snapshot.publishingReady ? 'release ready' : 'not ready'}
        </span>
      </div>
    </div>
  )
}
