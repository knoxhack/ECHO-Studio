import { useLocation } from 'react-router-dom'
import { findLabel } from '../nav'
import { useWorkspace } from '../state/WorkspaceContext'

export function Topbar(): JSX.Element {
  const loc = useLocation()
  const { workspaceDir, activeProject, chooseWorkspace } = useWorkspace()
  const label = findLabel(loc.pathname) || 'ECHO Studio'

  return (
    <header className="topbar">
      <div className="crumbs">
        <b>{label}</b>
        {activeProject && (
          <>
            {'  /  '}
            <span className="mono">{activeProject.manifest.id}</span>
          </>
        )}
      </div>
      <div className="spacer" />
      <div className="ws" title={workspaceDir}>
        {workspaceDir || 'No workspace'}
      </div>
      <button className="btn ghost" onClick={chooseWorkspace}>
        Change Workspace
      </button>
    </header>
  )
}
