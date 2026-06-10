import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { RUNTIME_LABELS, TARGET_LABELS } from '@shared/constants'
import { runPackOSCheck } from '@shared/validation'
import type { AddonProject, PackOSReport } from '@shared/types'

type IndexLane = 'all' | 'local' | 'handoff' | 'review' | 'indexed' | 'blocked'

const LANES: Array<{ id: IndexLane; label: string; detail: string; badge: string }> = [
  { id: 'local', label: 'Local Draft', detail: 'Build and validate before handoff.', badge: 'local' },
  { id: 'handoff', label: 'Handoff Ready', detail: 'Release assets can be reviewed for ingestion.', badge: 'ready' },
  { id: 'review', label: 'In Review', detail: 'Submitted, validating, or awaiting changes.', badge: 'community' },
  { id: 'indexed', label: 'Indexed', detail: 'Approved or published through the Release Index.', badge: 'verified' },
  { id: 'blocked', label: 'Blocked', detail: 'Rejected or blocked from public install.', badge: 'fixes' }
]

function laneFor(project: AddonProject, report: PackOSReport): IndexLane {
  if (project.manifest.trust.level === 'blocked' || project.publishStatus === 'rejected') return 'blocked'
  if (project.publishStatus === 'published' || project.publishStatus === 'approved') return 'indexed'
  if (['submitted', 'in_validation', 'changes_requested'].includes(project.publishStatus)) return 'review'
  if (report.publishingReady || project.publishStatus === 'ready') return 'handoff'
  return 'local'
}

function laneClass(lane: IndexLane): string {
  return LANES.find((item) => item.id === lane)?.badge ?? 'badge'
}

function laneLabel(lane: IndexLane): string {
  return LANES.find((item) => item.id === lane)?.label ?? 'Local Draft'
}

function searchText(project: AddonProject): string {
  const manifest = project.manifest
  return [
    manifest.name,
    manifest.id,
    manifest.namespace,
    manifest.publisher.name,
    manifest.publisher.id,
    manifest.version,
    project.publishStatus,
    manifest.trust.level,
    ...(manifest.tags ?? [])
  ].join(' ').toLowerCase()
}

export default function CommunityCatalog(): JSX.Element {
  const { projects, setActiveProject, refresh } = useWorkspace()
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [lane, setLane] = useState<IndexLane>('all')

  const rows = useMemo(
    () => projects.map((project) => {
      const report = runPackOSCheck(project.manifest)
      return { project, report, lane: laneFor(project, report) }
    }),
    [projects]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (lane !== 'all' && row.lane !== lane) return false
      return !needle || searchText(row.project).includes(needle)
    })
  }, [rows, query, lane])

  const open = (project: AddonProject, route: string): void => {
    setActiveProject(project.path)
    nav(route)
  }

  return (
    <Page
      title="Release Index Catalog"
      subtitle="Local projects grouped by Release Index readiness, review state, trust, targets, and runtime artifacts."
      actions={
        <button className="btn" onClick={refresh}>
          Refresh
        </button>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        {LANES.map((item) => {
          const count = rows.filter((row) => row.lane === item.id).length
          return (
            <button
              key={item.id}
              className={`tile ${lane === item.id ? 'selected' : ''}`}
              style={{ textAlign: 'left', minHeight: 130 }}
              onClick={() => setLane((current) => current === item.id ? 'all' : item.id)}
            >
              <span className={`badge ${item.badge}`}>{item.label}</span>
              <div className="metric" style={{ fontSize: 24 }}>{count}</div>
              <p className="dim" style={{ fontSize: 12 }}>{item.detail}</p>
            </button>
          )
        })}
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <input
          placeholder="Search by name, namespace, publisher, tag, or status..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <select value={lane} onChange={(event) => setLane(event.target.value as IndexLane)} style={{ width: 190 }}>
          <option value="all">All readiness lanes</option>
          {LANES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No projects match this Release Index filter.</div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(({ project, report, lane: projectLane }) => {
            const manifest = project.manifest
            const blockers = report.counts.BLOCKER + report.counts.ERROR
            return (
              <div className="card" key={project.path}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 style={{ flex: 1, margin: 0 }}>{manifest.name}</h3>
                  <span className={`badge ${laneClass(projectLane)}`}>{laneLabel(projectLane)}</span>
                  <span className="badge">{project.publishStatus}</span>
                  <span className={`badge ${manifest.trust.level}`}>{manifest.trust.level}</span>
                </div>
                <div className="mono dim" style={{ fontSize: 12, margin: '6px 0 10px' }}>
                  {manifest.id} v{manifest.version}
                </div>
                <div className="grid cols-4" style={{ gap: 10 }}>
                  <SmallStat label="PackOS" value={report.publishingReady ? `${report.compatibilityScore}% ready` : `${blockers} blocker/error`} tone={report.publishingReady ? 'var(--good)' : 'var(--warn)'} />
                  <SmallStat label="Targets" value={manifest.target.experiences.map((target) => TARGET_LABELS[target]).join(', ') || 'None'} />
                  <SmallStat label="Runtimes" value={manifest.runtime.supports.map((runtime) => RUNTIME_LABELS[runtime]).join(' + ') || 'None'} />
                  <SmallStat label="Modules" value={`${manifest.target.modules.length + manifest.dependencies.required.length} declared`} />
                </div>
                {manifest.tags?.length ? (
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    {manifest.tags.map((tag) => (
                      <span key={tag} className="badge" style={{ fontSize: 10 }}>{tag}</span>
                    ))}
                  </div>
                ) : null}
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => open(project, '/experience')}>Open</button>
                  <button className="btn" onClick={() => open(project, '/validation')}>Validate</button>
                  <button className="btn" onClick={() => open(project, '/release')}>Release Builder</button>
                  <button className="btn ghost" onClick={() => open(project, '/submit')}>Submission Review</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Page>
  )
}

function SmallStat({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="tile" style={{ minHeight: 76 }}>
      <h4>{label}</h4>
      <p style={{ margin: 0, color: tone ?? 'var(--text-dim)' }}>{value}</p>
    </div>
  )
}
