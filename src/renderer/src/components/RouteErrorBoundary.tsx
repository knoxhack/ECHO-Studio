import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface BoundaryProps {
  children: ReactNode
  openProjects: () => void
}

interface BoundaryState {
  error: Error | null
}

class RouteBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ECHO Studio route failed', error, info)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" style={{ maxWidth: 680 }}>
        <h3>Workspace View Failed</h3>
        <p className="dim" style={{ fontSize: 13 }}>
          {this.state.error.message || 'This view could not render the current project data.'}
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={this.props.openProjects}>
            Project Library
          </button>
        </div>
      </div>
    )
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <RouteBoundaryInner key={location.pathname} openProjects={() => navigate('/projects')}>
      {children}
    </RouteBoundaryInner>
  )
}
