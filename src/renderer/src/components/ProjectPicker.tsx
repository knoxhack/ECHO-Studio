import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/WorkspaceContext'

// Shown on builder pages when no project is selected. Lets the user pick one.
export function NoProject(): JSX.Element {
  const { projects, setActiveProject } = useWorkspace()
  const nav = useNavigate()
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3>Select a project to work on</h3>
      {projects.length === 0 ? (
        <>
          <p className="dim">
            Create a project, review starter templates, or configure your creator profile before opening builder tools.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => nav('/create')}>Create Project</button>
            <button className="btn" onClick={() => nav('/templates')}>Browse Templates</button>
            <button className="btn ghost" onClick={() => nav('/settings')}>Configure Settings</button>
          </div>
        </>
      ) : (
        <>
          <p className="dim">
            Pick a project, or open the project library for validation, preview, release, and repository actions.
          </p>
          {projects.map((p) => (
            <div className="list-row" key={p.path}>
              <div style={{ flex: 1 }}>
                <b>{p.manifest.name}</b>{' '}
                <span className="mono dim">{p.manifest.id}</span>
              </div>
              <button className="btn primary" onClick={() => setActiveProject(p.path)}>
                Select
              </button>
            </div>
          ))}
          <div className="btn-row">
            <button className="btn" onClick={() => nav('/projects')}>Open Project Library</button>
            <button className="btn ghost" onClick={() => nav('/docs')}>Read Docs</button>
          </div>
        </>
      )}
    </div>
  )
}

// Small inline header showing the active project plus a switch button.
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
