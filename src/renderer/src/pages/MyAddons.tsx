import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { runPackOSCheck } from '@shared/validation'
import { resolveProjectModulePlan } from '@shared/moduleCatalog'
import { ADDON_TYPE_LABELS, RUNTIME_LABELS, TARGET_LABELS } from '@shared/constants'
import type { AddonProject } from '@shared/types'

const FILTERS = ['All', 'Drafts', 'Ready', 'Submitted', 'Published', 'Needs Fixes', 'Needs Modules'] as const
type Filter = (typeof FILTERS)[number]

export default function MyAddons(): JSX.Element {
  const { projects, workspaceDir, setActiveProject, refresh, openInProject, toast } = useProjectLibraryHelpers()
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('All')
  const [importing, setImporting] = useState(false)

  const rows = useMemo(
    () =>
      projects.map((p) => ({
        project: p,
        report: runPackOSCheck(p.manifest),
        modulePlan: resolveProjectModulePlan(p.manifest)
      })),
    [projects]
  )

  const filtered = rows.filter(({ project, report, modulePlan }) => {
    switch (filter) {
      case 'Drafts':
        return project.publishStatus === 'draft'
      case 'Ready':
        return report.publishingReady && project.publishStatus === 'draft'
      case 'Submitted':
        return ['submitted', 'in_validation', 'changes_requested'].includes(project.publishStatus)
      case 'Published':
        return project.publishStatus === 'published'
      case 'Needs Fixes':
        return report.counts.BLOCKER > 0 || report.counts.ERROR > 0
      case 'Needs Modules':
        return modulePlan.missingRequired.length > 0 || modulePlan.unknown.length > 0 || modulePlan.closure.some((mod) => mod.blocked || mod.trustLevel === 'blocked')
      default:
        return true
    }
  })

  const open = (p: AddonProject, route: string): void => {
    setActiveProject(p.path)
    nav(route)
  }

  const importAddon = async (): Promise<void> => {
    if (!workspaceDir) return
    setImporting(true)
    const fileRes = await window.studio.chooseImportFile()
    const source = fileRes.ok ? fileRes.data : null
    if (source) {
      const res = await window.studio.importProject(workspaceDir, source)
      if (res.ok) { toast('Imported project'); refresh() }
      else toast(res.error || 'Import failed')
    } else {
      const folderRes = await window.studio.chooseImportFolder()
      const folder = folderRes.ok ? folderRes.data : null
      if (folder) {
        const res = await window.studio.importProject(workspaceDir, folder)
        if (res.ok) { toast('Imported project'); refresh() }
        else toast(res.error || 'Import failed')
      }
    }
    setImporting(false)
  }

  return (
    <Page
      title="Project Library"
      subtitle="Open, validate, preview, package, and release your ECHO projects."
      actions={
        <>
          <button className="btn" onClick={() => refresh()}>
            Refresh
          </button>
          <button className="btn" disabled={importing} onClick={importAddon}>
            {importing ? 'Importing...' : 'Import Project'}
          </button>
          <button className="btn primary" onClick={() => nav('/create')}>
            Create Project
          </button>
        </>
      }
    >
      <div className="btn-row" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`btn ${filter === f ? 'primary' : 'ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No projects match this filter.</div>
      ) : (
        <div className="grid cols-2">
          {filtered.map(({ project: p, report, modulePlan }) => {
            const m = p.manifest
            const blockedModules = modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
            const moduleIssueCount =
              modulePlan.missingRequired.length +
              modulePlan.unknown.length +
              blockedModules.length
            const moduleIssueText =
              modulePlan.missingRequired.length > 0
                ? `Missing closure: ${modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.`
                : modulePlan.unknown.length > 0
                  ? `Unknown dependencies: ${modulePlan.unknown.join(', ')}.`
                  : `Blocked modules: ${blockedModules.map((mod) => mod.name).join(', ')}.`
            const status =
              report.counts.BLOCKER > 0 || report.counts.ERROR > 0
                ? 'NEEDS FIXES'
                : report.counts.WARNING > 0
                  ? `Passed with ${report.counts.WARNING} warnings`
                  : 'Passed'
            return (
              <div className="card hover" key={p.path}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ flex: 1, margin: 0 }}>{m.name}</h3>
                  <span className={`badge ${m.trust.verified ? 'verified' : 'community'}`}>
                    {m.trust.verified ? 'Verified' : 'Community'}
                  </span>
                  {!m.trust.signed && <span className="badge unsigned">Unsigned</span>}
                </div>
                <div className="mono dim" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                  {m.id}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  <div>Type: {ADDON_TYPE_LABELS[guessType(m.projectClass, m.permissions)]}</div>
                  <div>
                    Target: {m.target.experiences.map((e) => TARGET_LABELS[e]).join(', ')}
                  </div>
                  <div>Version: {m.version}</div>
                  <div>
                    Runtime: {m.runtime.supports.map((r) => RUNTIME_LABELS[r]).join(' + ')}
                  </div>
                  <div>
                    Modules:{' '}
                    <span style={{ color: moduleIssueCount > 0 ? 'var(--warn)' : 'var(--good)' }}>
                      {modulePlan.enabled.length} selected / {modulePlan.closure.length} in closure
                    </span>
                    {moduleIssueCount > 0 && ` (${moduleIssueCount} issue${moduleIssueCount === 1 ? '' : 's'})`}
                  </div>
                  <div>
                    Validation:{' '}
                    <span
                      style={{
                        color: status === 'NEEDS FIXES' ? 'var(--bad)' : 'var(--good)'
                      }}
                    >
                      {status}
                    </span>
                  </div>
                  <div>
                    Publish: <span className="badge local">{p.publishStatus}</span>
                  </div>
                </div>
                {moduleIssueCount > 0 && (
                  <div className="issue WARNING" style={{ marginTop: 10 }}>
                    <span className="lvl">MODULES</span>
                    {moduleIssueText}
                    <div className="fix">Open Modules to sync dependency choices before setup, preview, or packaging.</div>
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => open(p, '/experience')}>
                    Open
                  </button>
                  <button className="btn" onClick={() => open(p, '/modules')}>
                    Modules
                  </button>
                  <button className="btn" onClick={() => open(p, '/dev-workspace')}>
                    Dev
                  </button>
                  <button className="btn" onClick={() => open(p, '/validation')}>
                    Validate
                  </button>
                  <button className="btn" onClick={() => open(p, '/preview')}>
                    Preview
                  </button>
                  <button className="btn" onClick={() => open(p, '/release')}>
                    Release
                  </button>
                  <button className="btn ghost" onClick={() => openInProject(p.path)}>
                    Open Folder
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Page>
  )
}

function guessType(projectClass: string, perms: string[]) {
  if (perms.includes('mission.register')) return 'mission_pack' as const
  if (perms.includes('recipe.register')) return 'recipe_pack' as const
  if (perms.includes('screen.custom_ui')) return 'ui_addon' as const
  if (perms.includes('holomap.layers')) return 'holomap_layer' as const
  if (perms.includes('index.entries')) return 'index_pack' as const
  if (projectClass === 'server_module') return 'server_module' as const
  if (projectClass === 'community_experience') return 'community_experience' as const
  if (projectClass === 'world_pack') return 'world_pack' as const
  if (projectClass === 'theme_pack') return 'theme_pack' as const
  if (projectClass === 'asset_pack') return 'asset_pack' as const
  return 'gameplay_addon' as const
}

function useProjectLibraryHelpers() {
  const ws = useWorkspace()
  return {
    ...ws,
    openInProject: (path: string) => window.studio.openPath(path)
  }
}
