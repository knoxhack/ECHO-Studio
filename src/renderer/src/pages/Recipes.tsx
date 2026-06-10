import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { Recipe } from '@shared/content/schemas'

const RECIPE_TYPES = [
  'crafting',
  'smelting',
  'machine_recipe',
  'recycler_recipe',
  'grinder_recipe',
  'extractor_recipe'
]

export default function Recipes(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('recipe')
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
              <div className="grid cols-2">
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
              {draft.inputs.map((inp, i) => (
                <div className="btn-row" key={i} style={{ marginBottom: 6 }}>
                  <input
                    style={{ flex: 2 }}
                    value={inp.item}
                    onChange={(e) =>
                      update({
                        inputs: draft.inputs.map((x, j) => (j === i ? { ...x, item: e.target.value } : x))
                      })
                    }
                  />
                  <input
                    style={{ width: 64 }}
                    type="number"
                    value={inp.count}
                    onChange={(e) =>
                      update({
                        inputs: draft.inputs.map((x, j) =>
                          j === i ? { ...x, count: Number(e.target.value) } : x
                        )
                      })
                    }
                  />
                  <button
                    className="btn ghost"
                    onClick={() => update({ inputs: draft.inputs.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="btn ghost"
                onClick={() => update({ inputs: [...draft.inputs, { item: `${ns}:input`, count: 1 }] })}
              >
                + Add input
              </button>
              <div className="section-title">Index</div>
              <label className="field">
                <span>Index entry id (for output)</span>
                <input
                  value={draft.indexEntry || ''}
                  onChange={(e) => update({ indexEntry: e.target.value })}
                />
              </label>
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
