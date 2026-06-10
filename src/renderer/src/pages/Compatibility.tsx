import { useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { RUNTIME_LABELS, ALLOWED_PERMISSIONS, BLOCKED_PERMISSIONS } from '@shared/constants'
import { normalizeModuleId, preferredModuleAlias, resolveProjectModulePlan } from '@shared/moduleCatalog'
import type { AddonManifest, PackOSReport, Runtime } from '@shared/types'

export default function Compatibility(): JSX.Element {
  const { activeProject, moduleCatalog, moduleCatalogResult } = useWorkspace()
  const [m, setM] = useState<AddonManifest | null>(null)
  const [report, setReport] = useState<PackOSReport | null>(null)

  useEffect(() => {
    if (!activeProject) {
      setM(null)
      setReport(null)
      return
    }
    window.studio.readManifest(activeProject.path).then((r) => r.ok && setM(r.data!))
    window.studio.fullCheck(activeProject.path).then((r) => r.ok && setReport(r.data!))
  }, [activeProject])

  const modulePlan = useMemo(() => m ? resolveProjectModulePlan(m, moduleCatalog) : null, [m, moduleCatalog])

  if (!activeProject)
    return (
      <Page title="Compatibility" subtitle="Runtime and experience compatibility report.">
        <NoProject />
      </Page>
    )

  if (!m || !report || !modulePlan) return <Page title="Compatibility"><div className="empty">Loading...</div></Page>

  const hs = report.healthScore
  const blockedUsed = m.permissions.filter((p) => p in BLOCKED_PERMISSIONS)
  const unknownUsed = m.permissions.filter((p) => !(ALLOWED_PERMISSIONS as readonly string[]).includes(p) && !(p in BLOCKED_PERMISSIONS))
  const blockedModules = modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
  const targetModuleIds = new Set(modulePlan.targetModules.map((mod) => normalizeModuleId(mod.id, moduleCatalog)))

  return (
    <Page title="Compatibility" subtitle="Deep analysis of runtime, permissions, dependencies and content coverage.">
      <ActiveBar />
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <ScoreCard label="Compatibility" value={`${hs.compatibility}%`} color={hs.compatibility >= 70 ? 'var(--good)' : hs.compatibility >= 40 ? 'var(--warn)' : 'var(--bad)'} />
        <ScoreCard label="Native Readiness" value={`${hs.nativeReadiness}%`} color={hs.nativeReadiness >= 70 ? 'var(--good)' : 'var(--warn)'} />
        <ScoreCard label="Assets" value={`${hs.assets}%`} />
        <ScoreCard label="Permissions" value={hs.permissions} color={hs.permissions === 'Safe' ? 'var(--good)' : hs.permissions === 'Risky' ? 'var(--warn)' : 'var(--bad)'} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Runtime Support</h3>
          {(Object.keys(RUNTIME_LABELS) as Runtime[]).map((r) => {
            const supported = m.runtime.supports.includes(r)
            const status =
              r === 'echo_native'
                ? m.runtime.nativeReadiness === 'partial'
                  ? 'Partial'
                  : supported
                    ? 'Supported'
                    : 'Not declared'
                : supported
                  ? 'Supported'
                  : 'Not tested'
            return (
              <div className="checkbox" key={r}>
                <span style={{ color: supported ? 'var(--good)' : 'var(--text-faint)' }}>
                  {supported ? 'Yes' : 'No'}
                </span>
                {RUNTIME_LABELS[r]}: <span className="dim">{status}</span>
              </div>
            )
          })}
          <div style={{ marginTop: 10, fontSize: 12 }} className="dim">
            Minimum contract set: <b>{m.runtime.minimumEchoSdk}</b> - Native readiness: <b>{m.runtime.nativeReadiness}</b>
          </div>
        </div>

        <div className="card">
          <h3>Target Experiences</h3>
          {m.target.experiences.map((e) => (
            <div className="checkbox" key={e}>
              <span style={{ color: 'var(--good)' }}>Yes</span>
              <span className="dim">{e}</span>
            </div>
          ))}
          {(modulePlan.targetModules.length > 0 || m.target.modules.length > 0) && (
            <div style={{ marginTop: 10 }}>
              <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>Target modules</div>
              <div className="btn-row">
                {modulePlan.targetModules.map((mod) => (
                  <span className="badge ready" key={mod.id}>{mod.name}</span>
                ))}
                {m.target.modules
                  .filter((id) => !targetModuleIds.has(normalizeModuleId(id, moduleCatalog)))
                  .map((id) => <span className="badge local" key={id}>{id}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Permissions Analysis</h3>
        <div style={{ marginBottom: 10 }}>Declared: <b>{m.permissions.length}</b></div>
        {blockedUsed.length > 0 && (
          <div className="alert" style={{ marginBottom: 10 }}>
            <b>Blocked permissions used:</b> {blockedUsed.join(', ')} - these will fail PackOS validation.
          </div>
        )}
        {unknownUsed.length > 0 && (
          <div style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 10 }}>
            <b>Unknown permissions:</b> {unknownUsed.join(', ')} - may be typos or unsupported.
          </div>
        )}
        <div className="grid cols-3" style={{ gap: 8 }}>
          {m.permissions.map((p) => (
            <span key={p} className="badge" style={{ fontSize: 11 }}>
              {p} {p in BLOCKED_PERMISSIONS ? 'BLOCKED' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Dependency Graph</h3>
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <span className={`badge ${moduleCatalogResult?.source === 'local-index' ? 'ready' : 'local'}`}>
            {moduleCatalogResult?.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in module catalog'}
          </span>
          <span className="badge">{modulePlan.targetModules.length} target</span>
          <span className="badge">{modulePlan.requiredModules.length} required</span>
          <span className="badge">{modulePlan.optionalModules.length} optional</span>
          <span className="badge">{modulePlan.closure.length} resolved</span>
        </div>
        {moduleCatalogResult?.warnings.length ? (
          <div className="issue WARNING" style={{ marginBottom: 10 }}>
            <span className="lvl">WARNING</span>
            {moduleCatalogResult.warnings.join(' ')}
          </div>
        ) : null}
        {modulePlan.unknown.length > 0 && (
          <div className="issue WARNING" style={{ marginBottom: 10 }}>
            <span className="lvl">UNKNOWN</span>
            Unknown dependencies or modules: {modulePlan.unknown.join(', ')}.
          </div>
        )}
        {modulePlan.missingRequired.length > 0 && (
          <div className="issue WARNING" style={{ marginBottom: 10 }}>
            <span className="lvl">CLOSURE</span>
            Missing required closure entries: {modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.
            <div className="fix">Open Modules or Codex Tasks to add the full required module closure before setup, preview, or release.</div>
          </div>
        )}
        {blockedModules.length > 0 && (
          <div className="issue BLOCKER" style={{ marginBottom: 10 }}>
            <span className="lvl">BLOCKED</span>
            Blocked modules in resolved graph: {blockedModules.map((mod) => mod.name).join(', ')}.
          </div>
        )}
        <div style={{ marginBottom: 8 }}>
          Manifest required: <b>{m.dependencies.required.length}</b> - Optional: <b>{m.dependencies.optional.length}</b> - Resolved closure: <b>{modulePlan.closure.length}</b>
        </div>
        {modulePlan.closure.map((mod) => {
          const declared = modulePlan.requiredModules.some((item) => normalizeModuleId(item.id, moduleCatalog) === mod.id)
          const target = modulePlan.targetModules.some((item) => normalizeModuleId(item.id, moduleCatalog) === mod.id)
          return (
            <div className="list-row" key={mod.id} style={{ padding: '6px 10px', marginBottom: 4 }}>
              <span style={{ flex: 1 }}>
                <b>{mod.name}</b> <span className="mono dim" style={{ fontSize: 11 }}>{preferredModuleAlias(mod)}</span>
              </span>
              <span className={`badge ${declared ? 'ready' : 'local'}`}>{declared ? 'required' : target ? 'target' : 'transitive'}</span>
              <span className={`badge ${mod.blocked || mod.trustLevel === 'blocked' ? 'fixes' : mod.status === 'stable' ? 'ready' : 'local'}`}>{mod.status}</span>
            </div>
          )
        })}
      </div>

      <div className="card">
        <h3>Publishing Readiness</h3>
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div>Description length: <b>{m.description?.length ?? 0}</b> chars {(!m.description || m.description.length < 10) && <span style={{ color: 'var(--warn)' }}>too short</span>}</div>
          <div>Tags: <b>{m.tags?.length ?? 0}</b> {(m.tags?.length ?? 0) === 0 && <span style={{ color: 'var(--warn)' }}>none set</span>}</div>
          <div>Support link: {m.support?.issues ? <span style={{ color: 'var(--good)' }}>set</span> : <span style={{ color: 'var(--warn)' }}>missing</span>}</div>
          <div>Trust level: <b>{m.trust.level}</b> - Signed: <b>{m.trust.signed ? 'Yes' : 'No'}</b> - Verified: <b>{m.trust.verified ? 'Yes' : 'No'}</b></div>
        </div>
      </div>
    </Page>
  )
}

function ScoreCard({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ fontSize: 24, color: color || 'var(--accent)' }}>
        {value}
      </div>
    </div>
  )
}
