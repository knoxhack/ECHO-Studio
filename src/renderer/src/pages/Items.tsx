import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { Item } from '@shared/content/schemas'

export default function Items(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('item')
  const [draft, setDraft] = useState<Item | null>(null)

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as Item)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Item Builder" subtitle="Create custom items with textures and models.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<Item>): void => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <Page
      title="Item Builder"
      subtitle="Items are saved to the project's content/items/ folder."
      actions={
        <>
          <button className="btn" onClick={() => setDraft(emptyContent('item', ns))}>
            + New Item
          </button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Item
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Items</h3>
          {records.length === 0 && <p className="dim">No items yet.</p>}
          {records.map((r) => (
            <div
              key={r.id}
              className="tree-node"
              style={{ color: draft?.id === r.id ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => setDraft(r.data as Item)}
            >
              {(r.data as Item).name}
            </div>
          ))}
        </div>

        {draft && (
          <>
            <div className="card">
              <h3>Editor</h3>
              <label className="field">
                <span>Item ID</span>
                <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
              </label>
              <label className="field">
                <span>Texture</span>
                <input
                  value={draft.texture || ''}
                  onChange={(e) => update({ texture: e.target.value })}
                  placeholder={`${ns}:my_item`}
                />
              </label>
              <label className="field">
                <span>Model</span>
                <input
                  value={draft.model || ''}
                  onChange={(e) => update({ model: e.target.value })}
                  placeholder={`${ns}:my_item`}
                />
              </label>
              <label className="field">
                <span>Max Stack</span>
                <input
                  type="number"
                  value={draft.maxStack ?? 64}
                  onChange={(e) => update({ maxStack: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="card">
              <h3>Actions</h3>
              <button
                className="btn ghost"
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
