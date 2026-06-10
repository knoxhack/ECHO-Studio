import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { LootTable } from '@shared/content/schemas'

export default function Loot(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('loot')
  const [draft, setDraft] = useState<LootTable | null>(null)

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as LootTable)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Loot Builder" subtitle="Create custom loot tables.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<LootTable>): void => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <Page
      title="Loot Builder"
      subtitle="Loot tables are saved to the project's content/loot/ folder."
      actions={
        <>
          <button className="btn" onClick={() => setDraft(emptyContent('loot', ns))}>
            + New Loot Table
          </button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Loot Table
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Loot Tables</h3>
          {records.length === 0 && <p className="dim">No loot tables yet.</p>}
          {records.map((r) => (
            <div
              key={r.id}
              className="tree-node"
              style={{ color: draft?.id === r.id ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => setDraft(r.data as LootTable)}
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
                <span>Loot Table ID</span>
                <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
              </label>
              <label className="field">
                <span>Rolls</span>
                <input
                  type="number"
                  value={draft.rolls}
                  onChange={(e) => update({ rolls: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="card">
              <h3>Entries</h3>
              {draft.entries.map((entry, i) => (
                <div className="btn-row" key={i} style={{ marginBottom: 6 }}>
                  <input
                    style={{ flex: 2 }}
                    value={entry.item}
                    onChange={(e) =>
                      update({
                        entries: draft.entries.map((x, j) => (j === i ? { ...x, item: e.target.value } : x))
                      })
                    }
                  />
                  <input
                    style={{ width: 70 }}
                    type="number"
                    value={entry.weight}
                    onChange={(e) =>
                      update({
                        entries: draft.entries.map((x, j) =>
                          j === i ? { ...x, weight: Number(e.target.value) } : x
                        )
                      })
                    }
                  />
                  <button
                    className="btn ghost"
                    onClick={() => update({ entries: draft.entries.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="btn ghost"
                onClick={() => update({ entries: [...draft.entries, { item: `${ns}:item`, weight: 1 }] })}
              >
                + Add entry
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
