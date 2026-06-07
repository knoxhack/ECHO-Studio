import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { runPackOSCheck } from '@shared/validation'
import { SDK_VERSION } from '@shared/constants'

export default function Dashboard(): JSX.Element {
  const { projects, setActiveProject, profile } = useWorkspace()
  const nav = useNavigate()

  const stats = useMemo(() => {
    let passed = 0
    let warnings = 0
    let failed = 0
    let readyToSubmit = 0
    for (const p of projects) {
      const r = runPackOSCheck(p.manifest)
      if (r.counts.BLOCKER > 0 || r.counts.ERROR > 0) failed++
      else if (r.counts.WARNING > 0) warnings++
      else passed++
      if (r.publishingReady && p.publishStatus === 'draft') readyToSubmit++
    }
    return { passed, warnings, failed, readyToSubmit }
  }, [projects])

  return (
    <Page
      title="Dashboard"
      subtitle="Welcome to ECHO Addon Studio — build on top of ECHO, not ECHO itself."
      actions={
        <>
          <button className="btn primary" onClick={() => nav('/create')}>
            Create New Addon
          </button>
          <button className="btn" onClick={() => nav('/packos')}>
            Run PackOS Check
          </button>
        </>
      }
    >
      <div className="grid cols-4">
        <div className="card hover" onClick={() => nav('/addons')}>
          <h3>My Addons</h3>
          <div className="metric">{projects.length}</div>
          <div className="sub">active projects</div>
        </div>
        <div className="card">
          <h3>Validation</h3>
          <div className="metric">{stats.passed}</div>
          <div className="sub">
            {stats.passed} passed · {stats.warnings} warning · {stats.failed} failed
          </div>
        </div>
        <div className="card hover" onClick={() => nav('/submit')}>
          <h3>Publishing</h3>
          <div className="metric">{stats.readyToSubmit}</div>
          <div className="sub">ready to submit</div>
        </div>
        <div className="card">
          <h3>SDK</h3>
          <div className="metric" style={{ fontSize: 20 }}>
            {SDK_VERSION}
          </div>
          <div className="sub">ECHO SDK installed</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Creator Profile</h3>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>
              Creator: <b>{profile.creatorName}</b>
            </div>
            <div>
              Role: <span className="dim">{profile.role.replace(/_/g, ' ')}</span>
            </div>
            <div>
              Namespace: <span className="mono">{profile.namespace}</span>
            </div>
            <div>
              Trust:{' '}
              {profile.verified ? (
                <span className="badge verified">Verified</span>
              ) : (
                <>
                  <span className="badge community">Community</span>{' '}
                  <span className="badge unsigned">Unverified</span>
                </>
              )}
            </div>
            <div>
              Published Addons: <b>{projects.filter((p) => p.publishStatus === 'published').length}</b>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => nav('/submit')}>
              Apply for Verified Creator
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Quick Actions</h3>
          <div className="btn-row">
            <button className="btn" onClick={() => nav('/create')}>
              Create New Addon
            </button>
            <button className="btn" onClick={() => nav('/templates')}>
              Browse Templates
            </button>
            <button className="btn" onClick={() => nav('/sandbox')}>
              Open Test Sandbox
            </button>
            <button className="btn" onClick={() => nav('/docs')}>
              Read SDK Docs
            </button>
            <button className="btn" onClick={() => nav('/ai')}>
              Ask AI Assistant
            </button>
          </div>
        </div>
      </div>

      <div className="section-title">Recent Projects</div>
      {projects.length === 0 ? (
        <div className="empty">
          No addons yet. <a onClick={() => nav('/create')}>Create your first addon →</a>
        </div>
      ) : (
        projects.slice(0, 5).map((p) => (
          <div className="list-row" key={p.path}>
            <div style={{ flex: 1 }}>
              <div>
                <b>{p.manifest.name}</b> <span className="mono dim">{p.manifest.id}</span>
              </div>
              <div className="faint" style={{ fontSize: 12 }}>
                v{p.manifest.version} · edited {new Date(p.lastEdited).toLocaleString()}
              </div>
            </div>
            <span className={`badge ${p.publishStatus === 'published' ? 'ready' : 'local'}`}>
              {p.publishStatus}
            </span>
            <button
              className="btn"
              onClick={() => {
                setActiveProject(p.path)
                nav('/manifest')
              }}
            >
              Open
            </button>
          </div>
        ))
      )}
    </Page>
  )
}
