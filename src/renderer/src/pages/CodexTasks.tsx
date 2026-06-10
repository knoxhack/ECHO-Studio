import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { CodexTask, CodexTaskLane } from '@shared/codexTasks'

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
                  selected.affectedFiles.map((file) => <span key={file} className="badge">{file}</span>)
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
                <button className="btn" onClick={() => nav(selected.route)}>Open Area</button>
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
