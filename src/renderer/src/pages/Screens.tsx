import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { Screen } from '@shared/content/schemas'

const PREVIEWS = ['720p', '1080p', '1440p', 'Ultrawide', 'Small window']

export default function Screens(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('screen')
  const [draft, setDraft] = useState<Screen | null>(null)
  const [preview, setPreview] = useState('1080p')

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as Screen)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Screen Builder" subtitle="Build ScreenCore UI addons and themes.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<Screen>): void => setDraft((d) => (d ? { ...d, ...patch } : d))

  // Simple heuristic checks over the XML.
  const xml = draft?.xml || ''
  const checks: [string, boolean][] = [
    ['Has root <Screen>', /<Screen[\s>]/.test(xml)],
    ['Balanced tags', (xml.match(/</g)?.length ?? 0) === (xml.match(/>/g)?.length ?? 0)],
    ['Has a Panel', /<Panel/.test(xml)],
    ['Theme set', !!draft?.theme]
  ]

  return (
    <Page
      title="Screen Builder"
      subtitle="Screens are saved to the project's screens/ folder."
      actions={
        <>
          <button className="btn" onClick={() => setDraft(emptyContent('screen', ns))}>+ New Screen</button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Screen
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="btn-row" style={{ marginBottom: 14 }}>
        {records.map((r) => (
          <button
            key={r.id}
            className={`btn ${draft?.id === r.id ? 'primary' : 'ghost'}`}
            onClick={() => setDraft(r.data as Screen)}
          >
            {(r.data as Screen).title}
          </button>
        ))}
      </div>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        {PREVIEWS.map((p) => (
          <button key={p} className={`btn ${preview === p ? 'primary' : 'ghost'}`} onClick={() => setPreview(p)}>
            {p}
          </button>
        ))}
      </div>

      {draft && (
        <div className="grid cols-2">
          <div className="card">
            <h3>XML - {preview}</h3>
            <label className="field">
              <span>Screen ID</span>
              <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label className="field">
              <span>Theme</span>
              <input value={draft.theme || ''} onChange={(e) => update({ theme: e.target.value })} />
            </label>
            <textarea
              className="mono"
              style={{ minHeight: 220, background: 'var(--bg-0)' }}
              value={draft.xml}
              onChange={(e) => update({ xml: e.target.value })}
            />
          </div>

          <div className="card">
            <h3>Preview &amp; Checks</h3>
            <div
              style={{
                border: '1px dashed var(--border-strong)',
                borderRadius: 8,
                height: 160,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text-faint)',
                marginBottom: 12
              }}
            >
              ScreenCore preview ({preview})
            </div>
            {checks.map(([label, ok]) => (
              <div className="checkbox" key={label}>
                <span style={{ color: ok ? 'var(--good)' : 'var(--warn)' }}>{ok ? 'OK' : 'Check'}</span>
                {label}
              </div>
            ))}
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              onClick={() => {
                const rec = records.find((r) => r.id === draft.id)
                if (rec) { remove(rec); setDraft(null) }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </Page>
  )
}
