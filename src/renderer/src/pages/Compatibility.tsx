import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { RUNTIME_LABELS, ALLOWED_PERMISSIONS, BLOCKED_PERMISSIONS } from '@shared/constants'
import { findEchoModule } from '@shared/moduleCatalog'
import type { AddonManifest, PackOSReport, Runtime } from '@shared/types'

export default function Compatibility(): JSX.Element {
  const { activeProject } = useWorkspace()
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

  if (!activeProject)
    return (
      <Page title="Compatibility" subtitle="Runtime and experience compatibility report.">
        <NoProject />
      </Page>
    )
  if (!m || !report) return <Page title="Compatibility"><div className="empty">Loading…</div></Page>

  const hs = report.healthScore
  const blockedUsed = m.permissions.filter((p) => p in BLOCKED_PERMISSIONS)
  const unknownUsed = m.permissions.filter((p) => !(ALLOWED_PERMISSIONS as readonly string[]).includes(p) && !(p in BLOCKED_PERMISSIONS))
  const missingDeps = m.dependencies.required.filter((d) => !findEchoModule(d) && !d.includes(':'))

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
                  {supported ? '✓' : '○'}
                </span>
                {RUNTIME_LABELS[r]}: <span className="dim">{status}</span>
              </div>
            )
          })}
          <div style={{ marginTop: 10, fontSize: 12 }} className="dim">
            Minimum SDK: <b>{m.runtime.minimumEchoSdk}</b> · Native readiness: <b>{m.runtime.nativeReadiness}</b>
          </div>
        </div>

        <div className="card">
          <h3>Target Experiences</h3>
          {m.target.experiences.map((e) => (
            <div className="checkbox" key={e}>
              <span style={{ color: 'var(--good)' }}>✓</span>
              <span className="dim">{e}</span>
            </div>
          ))}
          {m.target.modules.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12 }} className="dim">
              SDK modules: {m.target.modules.join(', ')}
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
              {p} {p in BLOCKED_PERMISSIONS ? '⚠ BLOCKED' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Dependency Graph</h3>
        <div style={{ marginBottom: 8 }}>Required: <b>{m.dependencies.required.length}</b> · Optional: <b>{m.dependencies.optional.length}</b></div>
        {m.dependencies.required.map((d) => (
          <div className="list-row" key={d} style={{ padding: '6px 10px', marginBottom: 4 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{d}</span>
            <span className="dim" style={{ fontSize: 11 }}>
              {findEchoModule(d)?.name ?? 'Third-party'}
            </span>
          </div>
        ))}
        {missingDeps.length > 0 && (
          <div style={{ color: 'var(--warn)', fontSize: 13, marginTop: 8 }}>
            ⚠ Dependencies without a namespace may be internal references.
          </div>
        )}
      </div>

      <div className="card">
        <h3>Publishing Readiness</h3>
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div>Description length: <b>{m.description?.length ?? 0}</b> chars {(!m.description || m.description.length < 10) && <span style={{ color: 'var(--warn)' }}>⚠ too short</span>}</div>
          <div>Tags: <b>{m.tags?.length ?? 0}</b> {(m.tags?.length ?? 0) === 0 && <span style={{ color: 'var(--warn)' }}>⚠ none set</span>}</div>
          <div>Support link: {m.support?.issues ? <span style={{ color: 'var(--good)' }}>✓ set</span> : <span style={{ color: 'var(--warn)' }}>⚠ missing</span>}</div>
          <div>Trust level: <b>{m.trust.level}</b> · Signed: <b>{m.trust.signed ? 'Yes' : 'No'}</b> · Verified: <b>{m.trust.verified ? 'Yes' : 'No'}</b></div>
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
