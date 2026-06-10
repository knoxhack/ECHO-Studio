import { useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import type { AddonProject } from '@shared/types'
import { summarizeBundleModules, type BundleModuleSummary, type ExperienceResult, type ServerPackResult } from '@shared/bundles'

export default function Ecosystem(): JSX.Element {
  const { workspaceDir, moduleCatalog, moduleCatalogResult } = useWorkspace()
  const [projects, setProjects] = useState<AddonProject[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'experience' | 'serverpack'>('experience')
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('myteam')
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExperienceResult | ServerPackResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!workspaceDir) return
    window.studio.listProjects(workspaceDir).then((res) => {
      if (res.ok && res.data) setProjects(res.data)
    })
  }, [workspaceDir])

  const toggle = (path: string) => {
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
    setResult(null)
    setError('')
  }

  const selectedProjects = useMemo(
    () => projects.filter((p) => selected.has(p.path)),
    [projects, selected]
  )
  const projectModuleSummaries = useMemo(
    () => new Map(projects.map((project) => [
      project.path,
      summarizeBundleModules([project.manifest], moduleCatalog)
    ])),
    [moduleCatalog, projects]
  )
  const selectedModuleSummary = useMemo(
    () => summarizeBundleModules(selectedProjects.map((project) => project.manifest), moduleCatalog),
    [moduleCatalog, selectedProjects]
  )

  const canBuild = selected.size > 0 && name.trim().length > 2 && namespace.trim().length > 0

  const buildExperience = async () => {
    if (!workspaceDir || !canBuild) return
    setBusy(true)
    setError('')
    setResult(null)
    const safeId = id.trim() || sanitize(name)
    const res = await window.studio.createExperience(
      workspaceDir,
      namespace.trim(),
      safeId,
      name.trim(),
      Array.from(selected)
    )
    setBusy(false)
    if (res.ok && res.data) {
      setResult(res.data)
    } else {
      setError(res.error || 'Failed to create experience.')
    }
  }

  const buildServerPack = async () => {
    if (!workspaceDir || selected.size === 0 || !name.trim()) return
    setBusy(true)
    setError('')
    setResult(null)
    const res = await window.studio.exportServerPack(workspaceDir, name.trim(), Array.from(selected))
    setBusy(false)
    if (res.ok && res.data) {
      setResult(res.data)
    } else {
      setError(res.error || 'Failed to export server pack.')
    }
  }

  return (
    <Page
      title="Ecosystem Builder"
      subtitle="Bundle projects into a Community Experience or export a Server Pack with resolved ECHO module metadata."
      actions={
        <span className={`badge ${moduleCatalogResult?.source === 'local-index' ? 'ready' : 'local'}`}>
          {moduleCatalogResult?.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in module catalog'}
        </span>
      }
    >
      {moduleCatalogResult?.warnings.length ? (
        <div className="issue WARNING" style={{ marginBottom: 12 }}>
          <span className="lvl">WARNING</span>
          {moduleCatalogResult.warnings.join(' ')}
        </div>
      ) : null}
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={`tab ${tab === 'experience' ? 'active' : ''}`} onClick={() => setTab('experience')}>
          Community Experience
        </button>
        <button className={`tab ${tab === 'serverpack' ? 'active' : ''}`} onClick={() => setTab('serverpack')}>
          Server Pack
        </button>
      </div>

      <div className="grid cols-2" style={{ gap: 16 }}>
        <div>
          <div className="section-title">Select Projects ({selected.size})</div>
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            {projects.length === 0 && (
              <div className="dim" style={{ padding: 12 }}>No ECHO projects found in workspace.</div>
            )}
            {projects.map((p) => {
              const summary = projectModuleSummaries.get(p.path)
              const issueCount = (summary?.missingRequired.length ?? 0) + (summary?.unknown.length ?? 0) + (summary?.blocked.length ?? 0)
              return (
                <label
                  key={p.path}
                  className="row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: selected.has(p.path) ? 'rgba(59,130,246,0.12)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.path)}
                    onChange={() => toggle(p.path)}
                  />
                  <span style={{ fontWeight: 600 }}>{p.manifest.name}</span>
                  <span className="dim" style={{ fontSize: 12, flex: 1 }}>{p.manifest.id}</span>
                  <span className={`badge ${issueCount > 0 ? 'fixes' : 'ready'}`} style={{ fontSize: 10 }}>
                    {summary?.moduleCount ?? 0} modules
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <div className="section-title">Bundle Details</div>
          <div className="form">
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Community Experience" />
            </div>
            {tab === 'experience' && (
              <>
                <div className="field">
                  <label>Namespace</label>
                  <input value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="myteam" />
                </div>
                <div className="field">
                  <label>ID (optional)</label>
                  <input value={id} onChange={(e) => setId(e.target.value)} placeholder={sanitize(name) || 'experience-id'} />
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            {tab === 'experience' ? (
              <button className="btn primary" disabled={!canBuild || busy} onClick={buildExperience}>
                {busy ? 'Building...' : 'Create Experience'}
              </button>
            ) : (
              <button className="btn primary" disabled={selected.size === 0 || !name.trim() || busy} onClick={buildServerPack}>
                {busy ? 'Exporting...' : 'Export Server Pack'}
              </button>
            )}
          </div>

          {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

          {result && 'path' in result && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4>Community Experience Created</h4>
              <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>{result.path}</div>
              <div>Members: {result.members.length}</div>
              <div>Module closure: {result.moduleSummary.moduleCount} module(s)</div>
              <div style={{ marginTop: 6 }}>
                <div className="sub">Load order</div>
                <ol style={{ margin: '4px 0 0 16px', fontSize: 12 }}>
                  {result.loadOrder.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ol>
              </div>
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="dim" style={{ fontSize: 12 }}>Warning: {w}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={() => window.studio.openPath(result.path)}>
                  Open Folder
                </button>
              </div>
            </div>
          )}

          {result && 'zipPath' in result && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4>Server Pack Exported</h4>
              <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>{result.zipPath}</div>
              <div>Members: {result.members.length}</div>
              <div>Required client addons: {result.requiredClientAddons.length}</div>
              <div>Module closure: {result.moduleSummary.moduleCount} module(s)</div>
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="dim" style={{ fontSize: 12 }}>Warning: {w}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={() => window.studio.openPath(result.zipPath)}>
                  Show in Folder
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedProjects.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">Selected Summary</div>
          <div className="grid cols-3">
            {selectedProjects.map((p) => (
              <div className="card" key={p.path}>
                <div style={{ fontWeight: 600 }}>{p.manifest.name}</div>
                <div className="dim" style={{ fontSize: 12 }}>{p.manifest.id}</div>
                <div className="dim" style={{ fontSize: 12 }}>{p.path}</div>
              </div>
            ))}
            <ModuleSummaryCard summary={selectedModuleSummary} />
          </div>
        </div>
      )}
    </Page>
  )
}

function ModuleSummaryCard({ summary }: { summary: BundleModuleSummary }): JSX.Element {
  const issueCount = summary.missingRequired.length + summary.unknown.length + summary.blocked.length
  return (
    <div className="card">
      <div style={{ fontWeight: 600 }}>ECHO Module Closure</div>
      <div className="btn-row" style={{ margin: '8px 0' }}>
        <span className={`badge ${issueCount > 0 ? 'fixes' : 'ready'}`}>{summary.moduleCount} resolved</span>
        <span className={`badge ${summary.localModuleCount > 0 ? 'ready' : 'local'}`}>{summary.localModuleCount} local source</span>
      </div>
      {summary.modules.length > 0 ? (
        <div className="btn-row">
          {summary.modules.slice(0, 8).map((mod) => (
            <span key={mod.id} className={`badge ${mod.localSource ? 'ready' : 'local'}`} style={{ fontSize: 10 }}>
              {mod.name}
            </span>
          ))}
          {summary.modules.length > 8 && <span className="badge">+{summary.modules.length - 8}</span>}
        </div>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>No ECHO modules resolved yet.</div>
      )}
      {issueCount > 0 && (
        <div className="issue WARNING" style={{ marginTop: 10 }}>
          <span className="lvl">MODULES</span>
          {summary.missingRequired.length > 0 && `Missing closure: ${summary.missingRequired.join(', ')}. `}
          {summary.unknown.length > 0 && `Unknown: ${summary.unknown.join(', ')}. `}
          {summary.blocked.length > 0 && `Blocked: ${summary.blocked.join(', ')}.`}
        </div>
      )}
    </div>
  )
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}
