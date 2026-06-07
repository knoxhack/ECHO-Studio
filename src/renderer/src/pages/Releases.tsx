import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { ReleaseEntry, ReleasesState } from '@shared/publishing'

const CHANNELS: ReleaseEntry['channel'][] = ['alpha', 'beta', 'stable']

export default function Releases(): JSX.Element {
  const { activeProject, toast } = useWorkspace()
  const [state, setState] = useState<ReleasesState | null>(null)
  const [channel, setChannel] = useState<ReleaseEntry['channel']>('alpha')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    if (!activeProject) return
    window.studio.getReleases(activeProject.path).then((r) => r.ok && setState(r.data!))
  }
  useEffect(load, [activeProject])

  if (!activeProject)
    return (
      <Page title="Releases" subtitle="Manage version channels and release history.">
        <NoProject />
      </Page>
    )

  const version = activeProject.manifest.version
  const latestPerChannel = (ch: string): ReleaseEntry | undefined =>
    state?.releases.find((r) => r.channel === ch)

  const cutRelease = async (): Promise<void> => {
    setBusy(true)
    const pkgRes = await window.studio.packageAddon(activeProject.path)
    if (!pkgRes.ok || !pkgRes.data) {
      setBusy(false)
      toast(pkgRes.error || 'Package failed')
      return
    }
    const entry: ReleaseEntry = {
      version,
      channel,
      hash: pkgRes.data.hash,
      zipPath: pkgRes.data.zipPath,
      notes,
      at: Date.now()
    }
    const res = await window.studio.addRelease(activeProject.path, entry)
    setBusy(false)
    if (res.ok && res.data) {
      setState(res.data)
      setNotes('')
      toast(`Released ${version} to ${channel}`)
    }
  }

  return (
    <Page
      title="Releases"
      subtitle="Cut versioned releases per channel. Each release packages the addon to exports/."
    >
      <ActiveBar />
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        {CHANNELS.map((ch) => {
          const rel = latestPerChannel(ch)
          return (
            <div className="card" key={ch}>
              <h3 style={{ textTransform: 'capitalize' }}>{ch} channel</h3>
              <div className="metric" style={{ fontSize: 18 }}>{rel ? `v${rel.version}` : '—'}</div>
              <div className="sub">{rel ? new Date(rel.at).toLocaleDateString() : 'no release yet'}</div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Cut a Release ({version})</h3>
        <div className="grid cols-2">
          <label className="field">
            <span>Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as ReleaseEntry['channel'])}>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Release notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <button className="btn primary" disabled={busy} onClick={cutRelease}>
          {busy ? 'Packaging…' : 'Package & Release'}
        </button>
      </div>

      <div className="section-title">Release History</div>
      {!state || state.releases.length === 0 ? (
        <div className="empty">No releases yet.</div>
      ) : (
        state.releases.map((r, i) => (
          <div className="list-row" key={i}>
            <div style={{ flex: 1 }}>
              <b>v{r.version}</b> <span className="dim">— {r.channel}</span>
              {r.notes && <div className="faint" style={{ fontSize: 12 }}>{r.notes}</div>}
              <div className="mono faint" style={{ fontSize: 10 }}>{r.hash.slice(0, 16)}…</div>
            </div>
            <span className="faint" style={{ fontSize: 12 }}>{new Date(r.at).toLocaleString()}</span>
            <button className="btn ghost" onClick={() => window.studio.openPath(r.zipPath.replace(/[\\/][^\\/]+$/, ''))}>
              Open
            </button>
          </div>
        ))
      )}
    </Page>
  )
}
