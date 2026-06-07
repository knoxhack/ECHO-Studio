import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { IndexEntry } from '@shared/content/schemas'

const ENTRY_TYPES = ['item', 'block', 'machine', 'recipe', 'lore', 'guide', 'faction', 'region', 'mission']

export default function IndexBuilder(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('index')
  const [draft, setDraft] = useState<IndexEntry | null>(null)

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as IndexEntry)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Index Data Builder" subtitle="Add Index entries, lore and guides.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<IndexEntry>): void => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <Page
      title="Index Data Builder"
      subtitle="Entries are saved to the project's index/ folder."
      actions={
        <>
          <button className="btn" onClick={() => setDraft(emptyContent('index', ns))}>
            + New Entry
          </button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Entry
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-3">
        <div className="card">
          <h3>Entries</h3>
          {records.length === 0 && <p className="dim">No entries yet.</p>}
          {records.map((r) => (
            <div
              key={r.id}
              className="tree-node"
              style={{ color: draft?.id === r.id ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => setDraft(r.data as IndexEntry)}
            >
              {(r.data as IndexEntry).title}
            </div>
          ))}
        </div>
        {draft && (
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <h3>Entry Editor</h3>
            <label className="field">
              <span>Entry ID</span>
              <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label className="field">
              <span>Type</span>
              <select value={draft.type} onChange={(e) => update({ type: e.target.value })}>
                {ENTRY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <input value={draft.category} onChange={(e) => update({ category: e.target.value })} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea value={draft.description} onChange={(e) => update({ description: e.target.value })} />
            </label>
            <label className="field">
              <span>Tags (comma separated)</span>
              <input
                value={(draft.tags || []).join(', ')}
                onChange={(e) => update({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              />
            </label>
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
        )}
      </div>
    </Page>
  )
}
