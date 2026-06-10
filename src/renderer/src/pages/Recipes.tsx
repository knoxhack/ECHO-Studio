import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { IndexEntry, Recipe } from '@shared/content/schemas'

const RECIPE_TYPES = [
  'crafting',
  'smelting',
  'machine_recipe',
  'recycler_recipe',
  'grinder_recipe',
  'extractor_recipe'
]

function localId(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}

function defaultIndexEntryId(recipe: Recipe, namespace: string): string {
  const local = localId(recipe.output.item || recipe.id || 'recipe_output')
  return `${namespace}:${local}_entry`
}

export default function Recipes(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('recipe')
  const { records: indexRecords } = useContent('index')
  const [draft, setDraft] = useState<Recipe | null>(null)

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as Recipe)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Recipe Builder" subtitle="Create crafting and machine recipes.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<Recipe>): void => setDraft((d) => (d ? { ...d, ...patch } : d))
  const indexEntries = indexRecords.map((record) => record.data as IndexEntry)
  const linkedIndexEntry = draft?.indexEntry
    ? indexEntries.find((entry) => entry.id === draft.indexEntry)
    : undefined
  const inputs = draft?.inputs ?? []

  return (
    <Page
      title="Recipe Builder"
      subtitle="Recipes are saved to the project's recipes/ folder."
      actions={
        <>
          <button className="btn" onClick={() => setDraft(emptyContent('recipe', ns))}>
            + New Recipe
          </button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Recipe
          </button>
        </>
      }
    >
      <ActiveBar />
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Recipes</h3>
          {records.length === 0 && <p className="dim">No recipes yet.</p>}
          {records.map((r) => (
            <div
              key={r.id}
              className="tree-node"
              style={{ color: draft?.id === r.id ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => setDraft(r.data as Recipe)}
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
                <span>Recipe ID</span>
                <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
              </label>
              <label className="field">
                <span>Type</span>
                <select value={draft.type} onChange={(e) => update({ type: e.target.value })}>
                  {RECIPE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Machine</span>
                <input
                  value={draft.machine || ''}
                  onChange={(e) => update({ machine: e.target.value })}
                  placeholder={`${ns}:grinder`}
                />
              </label>
              <label className="field">
                <span>Output item</span>
                <input
                  value={draft.output.item}
                  onChange={(e) => update({ output: { ...draft.output, item: e.target.value } })}
                />
              </label>
              <div className="grid cols-3">
                <label className="field">
                  <span>Output count</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.output.count}
                    onChange={(e) => update({ output: { ...draft.output, count: Number(e.target.value) } })}
                  />
                </label>
                <label className="field">
                  <span>Time</span>
                  <input
                    type="number"
                    value={draft.time ?? 0}
                    onChange={(e) => update({ time: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Energy</span>
                  <input
                    type="number"
                    value={draft.energy ?? 0}
                    onChange={(e) => update({ energy: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>

            <div className="card">
              <h3>Inputs</h3>
              {inputs.map((inp, i) => (
                <div className="btn-row" key={i} style={{ marginBottom: 6 }}>
                  <input
                    style={{ flex: 2 }}
                    value={inp.item}
                    onChange={(e) =>
                      update({
                        inputs: inputs.map((x, j) => (j === i ? { ...x, item: e.target.value } : x))
                      })
                    }
                  />
                  <input
                    style={{ width: 64 }}
                    type="number"
                    value={inp.count}
                    onChange={(e) =>
                      update({
                        inputs: inputs.map((x, j) =>
                          j === i ? { ...x, count: Number(e.target.value) } : x
                        )
                      })
                    }
                  />
                  <button
                    className="btn ghost"
                    onClick={() => update({ inputs: inputs.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="btn ghost"
                onClick={() => update({ inputs: [...inputs, { item: `${ns}:input`, count: 1 }] })}
              >
                + Add input
              </button>
              <div className="section-title">Index</div>
              <label className="field">
                <span>Index entry</span>
                <select
                  value={draft.indexEntry || ''}
                  onChange={(e) => update({ indexEntry: e.target.value || undefined })}
                >
                  <option value="">None</option>
                  {indexEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title || entry.id}
                    </option>
                  ))}
                  {draft.indexEntry && !linkedIndexEntry && (
                    <option value={draft.indexEntry}>{draft.indexEntry}</option>
                  )}
                </select>
              </label>
              <label className="field">
                <span>Index entry id</span>
                <input
                  value={draft.indexEntry || ''}
                  onChange={(e) => update({ indexEntry: e.target.value || undefined })}
                  placeholder={`${ns}:output_entry`}
                />
              </label>
              <div className="btn-row" style={{ marginBottom: 10 }}>
                <button
                  className="btn ghost"
                  onClick={() => update({ indexEntry: defaultIndexEntryId(draft, ns) })}
                >
                  Default Index ID
                </button>
                <span className={`badge ${draft.indexEntry ? linkedIndexEntry ? 'ready' : 'local' : 'local'}`}>
                  {draft.indexEntry ? linkedIndexEntry ? 'Index linked' : 'Index can be generated' : 'No Index link'}
                </span>
              </div>
              <button
                className="btn ghost"
                onClick={() => {
                  const rec = records.find((r) => r.id === draft.id)
                  if (rec) {
                    remove(rec)
                    setDraft(null)
                  }
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
