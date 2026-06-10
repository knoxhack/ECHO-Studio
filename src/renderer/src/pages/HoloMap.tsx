import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { useContent } from '../state/useContent'
import { emptyContent } from '@shared/content/paths'
import type { HoloMapLayer, HoloMapMarker, IndexEntry, Mission } from '@shared/content/schemas'

const LAYER_TYPES = ['poi', 'mission_route', 'hazard', 'faction', 'resource', 'region']

export default function HoloMap(): JSX.Element {
  const { activeProject } = useWorkspace()
  const { records, save, remove } = useContent('holomap')
  const { records: missionRecords } = useContent('mission')
  const { records: indexRecords } = useContent('index')
  const [layer, setLayer] = useState<HoloMapLayer | null>(null)
  const [sel, setSel] = useState(0)

  useEffect(() => {
    if (!layer && records.length) setLayer(records[0].data as HoloMapLayer)
  }, [records, layer])

  if (!activeProject)
    return (
      <Page title="HoloMap Layer Builder" subtitle="Create map overlays.">
        <NoProject />
      </Page>
    )

  const ns = activeProject.manifest.namespace
  const markers = layer?.markers ?? []
  const marker = markers[sel]
  const missions = missionRecords.map((record) => record.data as Mission)
  const indexEntries = indexRecords.map((record) => record.data as IndexEntry)

  const updateLayer = (patch: Partial<HoloMapLayer>): void =>
    setLayer((l) => (l ? { ...l, ...patch } : l))
  const updateMarker = (patch: Partial<HoloMapMarker>): void =>
    updateLayer({ markers: markers.map((m, i) => (i === sel ? { ...m, ...patch } : m)) })

  const addMarker = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!layer) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
    const z = Math.round(((e.clientY - rect.top) / rect.height) * 100)
    const m: HoloMapMarker = { id: `${ns}:marker_${markers.length + 1}`, title: 'New Marker', icon: 'poi', x, z, visibleByDefault: true }
    updateLayer({ markers: [...markers, m] })
    setSel(markers.length)
  }

  return (
    <Page
      title="HoloMap Layer Builder"
      subtitle="Click the map to add a marker. Layers are saved to holomap/."
      actions={
        <>
          <button className="btn" onClick={() => { setLayer(emptyContent('holomap', ns)); setSel(0) }}>
            + New Layer
          </button>
          <button className="btn primary" disabled={!layer} onClick={() => layer && save(layer)}>
            Save Layer
          </button>
        </>
      }
    >
      <ActiveBar />
      {records.length > 0 && (
        <div className="btn-row" style={{ marginBottom: 14 }}>
          {records.map((r) => (
            <button
              key={r.id}
              className={`btn ${layer?.id === r.id ? 'primary' : 'ghost'}`}
              onClick={() => { setLayer(r.data as HoloMapLayer); setSel(0) }}
            >
              {(r.data as HoloMapLayer).title}
            </button>
          ))}
        </div>
      )}

      {layer && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Map Canvas</h3>
            <div
              onClick={addMarker}
              style={{
                position: 'relative',
                height: 300,
                borderRadius: 8,
                background:
                  'repeating-linear-gradient(0deg,#0d1622,#0d1622 19px,#10202f 20px), repeating-linear-gradient(90deg,#0d1622,#0d1622 19px,#10202f 20px)',
                border: '1px solid var(--border-strong)',
                cursor: 'crosshair'
              }}
            >
              {markers.map((m, i) => (
                <div
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setSel(i) }}
                  title={m.title}
                  style={{
                    position: 'absolute',
                    left: `${m.x}%`,
                    top: `${m.z}%`,
                    transform: 'translate(-50%,-50%)',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: i === sel ? 'var(--accent)' : 'var(--accent-2)',
                    boxShadow: '0 0 8px var(--accent-glow)',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Layer &amp; Marker</h3>
            <label className="field">
              <span>Layer ID</span>
              <input value={layer.id} onChange={(e) => updateLayer({ id: e.target.value })} />
            </label>
            <label className="field">
              <span>Layer type</span>
              <select value={layer.type} onChange={(e) => updateLayer({ type: e.target.value })}>
                {LAYER_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {marker ? (
              <>
                <label className="field">
                  <span>Marker ID</span>
                  <input value={marker.id} onChange={(e) => updateMarker({ id: e.target.value })} />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input value={marker.title} onChange={(e) => updateMarker({ title: e.target.value })} />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    value={marker.description || ''}
                    onChange={(e) => updateMarker({ description: e.target.value || undefined })}
                  />
                </label>
                <label className="field">
                  <span>Icon</span>
                  <input value={marker.icon} onChange={(e) => updateMarker({ icon: e.target.value })} />
                </label>
                <label className="field">
                  <span>Linked mission</span>
                  <select
                    value={marker.linkedMission || ''}
                    onChange={(e) => updateMarker({ linkedMission: e.target.value || undefined })}
                  >
                    <option value="">None</option>
                    {missions.map((mission) => (
                      <option key={mission.id} value={mission.id}>
                        {mission.title || mission.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Linked Index entry</span>
                  <select
                    value={marker.linkedIndex || ''}
                    onChange={(e) => updateMarker({ linkedIndex: e.target.value || undefined })}
                  >
                    <option value="">None</option>
                    {indexEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title || entry.id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid cols-2">
                  <label className="field">
                    <span>X position</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={marker.x}
                      onChange={(e) => updateMarker({ x: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Z position</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={marker.z}
                      onChange={(e) => updateMarker({ z: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={marker.visibleByDefault !== false}
                    onChange={(e) => updateMarker({ visibleByDefault: e.target.checked })}
                  />
                  Visible by default
                </label>
                <div className="btn-row">
                  <span className={`badge ${marker.linkedMission ? 'ready' : 'local'}`}>
                    {marker.linkedMission ? 'Mission linked' : 'No mission'}
                  </span>
                  <span className={`badge ${marker.linkedIndex ? 'ready' : 'local'}`}>
                    {marker.linkedIndex ? 'Index linked' : 'No Index'}
                  </span>
                  <span className="badge">x {marker.x} / z {marker.z}</span>
                </div>
                <button
                  className="btn ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => { updateLayer({ markers: markers.filter((_, i) => i !== sel) }); setSel(0) }}
                >
                  Remove marker
                </button>
              </>
            ) : (
              <p className="dim">Click the map to add a marker.</p>
            )}
            <button
              className="btn ghost"
              style={{ marginTop: 8 }}
              onClick={() => {
                const rec = records.find((r) => r.id === layer.id)
                if (rec) { remove(rec); setLayer(null) }
              }}
            >
              Delete layer
            </button>
          </div>
        </div>
      )}
    </Page>
  )
}
