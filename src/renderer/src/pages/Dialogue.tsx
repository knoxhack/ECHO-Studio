import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { Dialogue } from '@shared/content/schemas'

export default function DialogueBuilder(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('dialogue')
  const [draft, setDraft] = useState<Dialogue | null>(null)

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as Dialogue)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Dialogue Builder" subtitle="Create NPC dialogue trees.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<Dialogue>): void => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <Page
      title="Dialogue Builder"
      subtitle="Dialogue trees are saved to the project's content/dialogue/ folder."
      actions={
        <>
          <button className="btn" onClick={() => setDraft(emptyContent('dialogue', ns))}>
            + New Dialogue
          </button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Dialogue
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Dialogues</h3>
          {records.length === 0 && <p className="dim">No dialogues yet.</p>}
          {records.map((r) => (
            <div
              key={r.id}
              className="tree-node"
              style={{ color: draft?.id === r.id ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => setDraft(r.data as Dialogue)}
            >
              {r.id}
            </div>
          ))}
        </div>

        {draft && (
          <>
            <div className="card">
              <h3>Editor</h3>
              <label className="field">
                <span>Dialogue ID</span>
                <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
              </label>
              <label className="field">
                <span>NPC</span>
                <input value={draft.npc} onChange={(e) => update({ npc: e.target.value })} />
              </label>
            </div>

            <div className="card">
              <h3>Lines</h3>
              {draft.lines.map((line, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 10, background: 'var(--bg-2)', borderRadius: 6 }}>
                  <div className="btn-row" style={{ marginBottom: 6 }}>
                    <input
                      style={{ flex: 1 }}
                      value={line.speaker}
                      onChange={(e) =>
                        update({
                          lines: draft.lines.map((x, j) => (j === i ? { ...x, speaker: e.target.value } : x))
                        })
                      }
                      placeholder="Speaker"
                    />
                    <input
                      style={{ flex: 1 }}
                      value={line.next || ''}
                      onChange={(e) =>
                        update({
                          lines: draft.lines.map((x, j) => (j === i ? { ...x, next: e.target.value || undefined } : x))
                        })
                      }
                      placeholder="Next line id (optional)"
                    />
                    <button
                      className="btn ghost"
                      onClick={() => update({ lines: draft.lines.filter((_, j) => j !== i) })}
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    value={line.text}
                    onChange={(e) =>
                      update({
                        lines: draft.lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                      })
                    }
                    placeholder="Dialogue text…"
                    style={{ minHeight: 60 }}
                  />
                </div>
              ))}
              <button
                className="btn ghost"
                onClick={() => update({ lines: [...draft.lines, { speaker: 'npc', text: '' }] })}
              >
                + Add line
              </button>
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
          </>
        )}
      </div>
    </Page>
  )
}
