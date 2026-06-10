import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import type { AddonProject } from '@shared/types'
import type { ExperienceResult, ServerPackResult } from '@shared/bundles'

export default function Ecosystem(): JSX.Element {
  const { workspaceDir } = useWorkspace()
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

  const selectedProjects = projects.filter((p) => selected.has(p.path))

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
      subtitle="Bundle multiple addons into a Community Experience or export a Server Pack."
    >
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
          <div className="section-title">Select Addons ({selected.size})</div>
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            {projects.length === 0 && (
              <div className="dim" style={{ padding: 12 }}>No addons found in workspace.</div>
            )}
            {projects.map((p) => (
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
                <span className="dim" style={{ fontSize: 12 }}>{p.manifest.namespace}:{p.manifest.id}</span>
              </label>
            ))}
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
                    <div key={i} className="dim" style={{ fontSize: 12 }}>⚠ {w}</div>
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
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="dim" style={{ fontSize: 12 }}>⚠ {w}</div>
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
                <div className="dim" style={{ fontSize: 12 }}>{p.manifest.namespace}:{p.manifest.id}</div>
                <div className="dim" style={{ fontSize: 12 }}>{p.path}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  )
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}
