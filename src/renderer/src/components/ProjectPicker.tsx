import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/WorkspaceContext'

// Shown on builder pages when no project is selected. Lets the user pick one.
export function NoProject(): JSX.Element {
  const { projects, setActiveProject } = useWorkspace()
  const nav = useNavigate()
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3>Select an addon to work on</h3>
      {projects.length === 0 ? (
        <p className="dim">
          You have no addons yet. <a onClick={() => nav('/create')}>Create one →</a>
        </p>
      ) : (
        projects.map((p) => (
          <div className="list-row" key={p.path}>
            <div style={{ flex: 1 }}>
              <b>{p.manifest.name}</b>{' '}
              <span className="mono dim">{p.manifest.id}</span>
            </div>
            <button className="btn primary" onClick={() => setActiveProject(p.path)}>
              Select
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// Small inline header showing the active project + a switch button.
export function ActiveBar(): JSX.Element | null {
  const { activeProject, setActiveProject } = useWorkspace()
  if (!activeProject) return null
  return (
    <div
      className="list-row"
      style={{ marginBottom: 18, background: 'var(--bg-2)' }}
    >
      <div style={{ flex: 1 }}>
        Working on <b>{activeProject.manifest.name}</b>{' '}
        <span className="mono dim">{activeProject.manifest.id}</span>
      </div>
      <button className="btn ghost" onClick={() => setActiveProject(null)}>
        Switch
      </button>
    </div>
  )
}
