import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { runPackOSCheck } from '@shared/validation'
import { SDK_VERSION } from '@shared/constants'
import { resolveProjectModulePlan } from '@shared/moduleCatalog'

export default function Dashboard(): JSX.Element {
  const { projects, setActiveProject, profile, moduleCatalog, moduleCatalogResult } = useWorkspace()
  const nav = useNavigate()

  const stats = useMemo(() => {
    let passed = 0
    let warnings = 0
    let failed = 0
    let readyToRelease = 0
    let resolvedModules = 0
    for (const project of projects) {
      const report = runPackOSCheck(project.manifest, moduleCatalog)
      const modulePlan = resolveProjectModulePlan(project.manifest, moduleCatalog)
      resolvedModules += modulePlan.closure.length
      if (report.counts.BLOCKER > 0 || report.counts.ERROR > 0) failed++
      else if (report.counts.WARNING > 0) warnings++
      else passed++
      if (report.publishingReady && project.publishStatus === 'draft') readyToRelease++
    }
    return { passed, warnings, failed, readyToRelease, resolvedModules }
  }, [moduleCatalog, projects])

  return (
    <Page
      title="Home"
      subtitle="Mission control for ECHO experiences, modules, local tools, validation, and release readiness."
      actions={
        <>
          <button className="btn primary" onClick={() => nav('/create')}>
            Create Project
          </button>
          <button className="btn" onClick={() => nav('/validation')}>
            Run Validation
          </button>
        </>
      }
    >
      <div className="grid cols-4">
        <div className="card hover" onClick={() => nav('/projects')}>
          <h3>Projects</h3>
          <div className="metric">{projects.length}</div>
          <div className="sub">active workspaces</div>
        </div>
        <div className="card hover" onClick={() => nav('/modules')}>
          <h3>Resolved Modules</h3>
          <div className="metric">{stats.resolvedModules}</div>
          <div className="sub">
            {moduleCatalogResult?.source === 'local-index' ? 'from local ECHO-Modules' : 'from built-in catalog'}
          </div>
        </div>
        <div className="card">
          <h3>Validation</h3>
          <div className="metric">{stats.passed}</div>
          <div className="sub">
            {stats.passed} passed / {stats.warnings} warning / {stats.failed} failed
          </div>
        </div>
        <div className="card hover" onClick={() => nav('/release')}>
          <h3>Release</h3>
          <div className="metric">{stats.readyToRelease}</div>
          <div className="sub">ready for local packaging</div>
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
              Published projects: <b>{projects.filter((project) => project.publishStatus === 'published').length}</b>
            </div>
            <div>
              Contracts: <b>{SDK_VERSION}</b>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => nav('/settings')}>
              Edit Profile
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Local Loop</h3>
          <p className="dim" style={{ fontSize: 13 }}>
            Choose modules, generate a dev workspace, run a preview, validate PackOS, then package local release assets before GitHub publishing.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={() => nav('/modules')}>
              Modules
            </button>
            <button className="btn" onClick={() => nav('/dev-workspace')}>
              Dev Workspace
            </button>
            <button className="btn" onClick={() => nav('/preview')}>
              Preview
            </button>
            <button className="btn" onClick={() => nav('/codex')}>
              Codex Tasks
            </button>
          </div>
        </div>
      </div>

      <div className="section-title">Recent Projects</div>
      {projects.length === 0 ? (
        <div className="empty">
          No projects yet. <a onClick={() => nav('/create')}>Create your first ECHO project</a>
        </div>
      ) : (
        projects.slice(0, 5).map((project) => {
          const localModulePlan = resolveProjectModulePlan(project.manifest, moduleCatalog)
          return (
            <div className="list-row" key={project.path}>
              <div style={{ flex: 1 }}>
                <div>
                  <b>{project.manifest.name}</b> <span className="mono dim">{project.manifest.id}</span>
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  v{project.manifest.version} / {localModulePlan.targetModules.length} target / {localModulePlan.closure.length} resolved / edited {new Date(project.lastEdited).toLocaleString()}
                </div>
              </div>
              <span className={`badge ${project.publishStatus === 'published' ? 'ready' : 'local'}`}>
                {project.publishStatus}
              </span>
              <button
                className="btn"
                onClick={() => {
                  setActiveProject(project.path)
                  nav('/experience')
                }}
              >
                Open
              </button>
              <button
                className="btn"
                onClick={() => {
                  setActiveProject(project.path)
                  nav('/dev-workspace')
                }}
              >
                Dev
              </button>
            </div>
          )
        })
      )}
    </Page>
  )
}
