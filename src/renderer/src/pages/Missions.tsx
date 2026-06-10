import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { Mission } from '@shared/content/schemas'

const OBJECTIVES = [
  'visit_location',
  'collect_item',
  'craft_item',
  'scan_object',
  'defeat_enemy',
  'talk_to_npc',
  'repair_structure',
  'activate_device',
  'survive_event',
  'deliver_item',
  'clear_area',
  'choose_dialogue'
]

export default function Missions(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove, reload } = useContent('mission')
  const [draft, setDraft] = useState<Mission | null>(null)

  useEffect(() => {
    if (!draft && records.length) setDraft(records[0].data as Mission)
  }, [records, draft])

  if (!activeProject)
    return (
      <Page title="Mission Builder" subtitle="Design mission chains with objectives, rewards and markers.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const update = (patch: Partial<Mission>): void =>
    setDraft((d) => (d ? { ...d, ...patch } : d))

  const newMission = (): void => setDraft(emptyContent('mission', ns))

  return (
    <Page
      title="Mission Builder"
      subtitle="Design mission chains visually. Missions are saved to the project's missions/ folder."
      actions={
        <>
          <button className="btn" onClick={newMission}>+ New Mission</button>
          <button className="btn primary" disabled={!draft} onClick={() => draft && save(draft)}>
            Save Mission
          </button>
        </>
      }
    >
      <ActiveBar />

      <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
        <div className="section-title" style={{ marginTop: 0 }}>Mission Graph</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="badge ready">Start</div>
          {records.length === 0 && <span className="dim">No missions yet - create one.</span>}
          {records.map((r) => {
            const m = r.data as Mission
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dim">→</span>
                <button
                  className={`tile ${draft?.id === m.id ? 'selected' : ''}`}
                  style={{ minWidth: 150, padding: 12 }}
                  onClick={() => setDraft(m)}
                >
                  <h4 style={{ fontSize: 13 }}>{m.title}</h4>
                  <p className="mono" style={{ fontSize: 10 }}>{m.id}</p>
                  {m.rewards.length === 0 && (
                    <p style={{ color: 'var(--warn)', fontSize: 11 }}>⚠ no reward</p>
                  )}
                </button>
              </div>
            )
          })}
          <span className="dim">→</span>
          <div className="badge verified">Final Reward</div>
        </div>
      </div>

      {draft && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Mission Editor</h3>
            <label className="field">
              <span>Mission ID</span>
              <input value={draft.id} onChange={(e) => update({ id: e.target.value })} />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={draft.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                value={draft.description || ''}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Objective type</span>
              <select
                value={draft.objective.type}
                onChange={(e) => update({ objective: { ...draft.objective, type: e.target.value } })}
              >
                {OBJECTIVES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Objective target</span>
              <input
                value={draft.objective.target || ''}
                onChange={(e) => update({ objective: { ...draft.objective, target: e.target.value } })}
                placeholder={`${ns}:beacon_site`}
              />
            </label>
            <label className="field">
              <span>Unlock after (mission id)</span>
              <input
                value={draft.unlockAfter || ''}
                onChange={(e) => update({ unlockAfter: e.target.value })}
              />
            </label>
            <div className="btn-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!draft.repeatable}
                  onChange={(e) => update({ repeatable: e.target.checked })}
                />
                Repeatable
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!draft.hidden}
                  onChange={(e) => update({ hidden: e.target.checked })}
                />
                Hidden
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!draft.timed}
                  onChange={(e) => update({ timed: e.target.checked })}
                />
                Timed
              </label>
            </div>
          </div>

          <div className="card">
            <h3>Rewards &amp; Validation</h3>
            {draft.rewards.map((rw, i) => (
              <div className="btn-row" key={i} style={{ marginBottom: 6 }}>
                <input
                  style={{ flex: 2 }}
                  value={rw.item}
                  onChange={(e) =>
                    update({
                      rewards: draft.rewards.map((x, j) => (j === i ? { ...x, item: e.target.value } : x))
                    })
                  }
                />
                <input
                  style={{ width: 70 }}
                  type="number"
                  value={rw.count}
                  onChange={(e) =>
                    update({
                      rewards: draft.rewards.map((x, j) =>
                        j === i ? { ...x, count: Number(e.target.value) } : x
                      )
                    })
                  }
                />
                <button
                  className="btn ghost"
                  onClick={() => update({ rewards: draft.rewards.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn ghost"
              onClick={() =>
                update({ rewards: [...draft.rewards, { item: `${ns}:reward`, count: 1 }] })
              }
            >
              + Add reward
            </button>

            <div style={{ marginTop: 14 }}>
              {draft.rewards.length === 0 ? (
                <div className="issue WARNING">
                  <span className="lvl">WARNING</span>
                  Mission has no reward.
                </div>
              ) : (
                <div className="issue SUGGESTION">
                  <span className="lvl">INFO</span>
                  Mission looks valid. Run PackOS Check for cross-content validation.
                </div>
              )}
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                className="btn ghost"
                onClick={async () => {
                  const rec = records.find((r) => r.id === draft.id)
                  if (rec) {
                    await remove(rec)
                    setDraft(null)
                    reload()
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
