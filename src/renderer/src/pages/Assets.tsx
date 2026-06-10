import { useCallback, useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { AssetReport } from '@shared/assets'

const AI_PROMPTS = [
  'Generate 32x32 item texture prompt',
  'Generate block texture prompt',
  'Generate entity texture prompt',
  'Generate icon set prompt'
]

export default function Assets(): JSX.Element {
  const { activeProject, toast } = useWorkspace()
  const [report, setReport] = useState<AssetReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const scan = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const res = await window.studio.scanAssets(activeProject.path)
    setLoading(false)
    if (res.ok && res.data) setReport(res.data)
  }, [activeProject])

  useEffect(() => {
    scan()
  }, [scan])

  if (!activeProject)
    return (
      <Page title="Asset Manager" subtitle="Strict asset validation for textures, models, sounds and icons.">
        <NoProject />
      </Page>
    )

  const importInto = async (folder: string): Promise<void> => {
    const res = await window.studio.importAssets(activeProject.path, folder)
    if (res.ok && res.data) {
      toast(`Imported ${res.data.length} file(s)`)
      scan()
    }
  }

  const exportPack = async (): Promise<void> => {
    const res = await window.studio.exportAssetPack(activeProject.path)
    if (res.ok && res.data) {
      toast('Asset pack exported')
      window.studio.openPath(res.data.replace(/[\\/][^\\/]+$/, ''))
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!activeProject) return
    const files: string[] = []
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const f = e.dataTransfer.files[i] as any
      if (f.path) files.push(f.path)
    }
    if (files.length === 0) {
      toast('Drop file paths not available. Use Import buttons instead.')
      return
    }
    // Send files to main process to copy into assets/drop/
    const res = await window.studio.importAssetDrop(activeProject.path, files)
    if (res.ok && res.data) {
      toast(`Imported ${res.data.length} file(s) via drag-and-drop`)
      scan()
    }
  }

  return (
    <Page
      title="Asset Manager"
      subtitle="Real asset scanning: PNG validity, resolution, duplicates and missing references."
      actions={
        <>
          <button className="btn" disabled={loading} onClick={scan}>
            {loading ? 'Scanning...' : 'Batch Validate'}
          </button>
          <button className="btn" onClick={() => importInto('textures')}>
            Import Texture
          </button>
          <button className="btn primary" onClick={exportPack}>
            Export Asset Pack
          </button>
        </>
      }
    >
      <ActiveBar />
      <div
        className="card"
        style={{
          border: dragOver ? '2px dashed var(--accent)' : '1px solid var(--border)',
          background: dragOver ? 'var(--accent-glow)' : undefined,
          textAlign: 'center',
          padding: '20px',
          marginBottom: 16,
          cursor: 'pointer'
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="dim" style={{ fontSize: 13 }}>
          {dragOver ? 'Drop files to import' : 'Drag and drop files here to import into assets/'}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Assets ({report?.assets.length ?? 0})</h3>
          {report && report.assets.length === 0 && (
            <p className="dim">No assets yet. Import a texture to get started.</p>
          )}
          {report?.assets.map((a) => (
            <div className="list-row" key={a.rel} style={{ background: 'var(--bg-2)' }}>
              <span style={{ color: a.valid ? 'var(--good)' : 'var(--bad)' }}>
                {a.valid ? 'OK' : 'Issue'}
              </span>
              <div style={{ flex: 1 }}>
                <span className="mono" style={{ fontSize: 12 }}>{a.rel}</span>
                <div className="faint" style={{ fontSize: 11 }}>
                  {a.kind}
                  {a.width ? ` - ${a.width}x${a.height}` : ''} - {a.bytes} B
                  {a.issues.length > 0 && <span style={{ color: 'var(--warn)' }}> - {a.issues.join(', ')}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Problems ({report?.problems.length ?? 0})</h3>
          {report && report.problems.length === 0 && (
            <p className="dim">No problems detected.</p>
          )}
          {report?.problems.map((p, i) => (
            <div className={`issue ${p.level}`} key={i}>
              <span className="lvl">{p.level}</span>
              {p.message}
            </div>
          ))}

          <div className="section-title">Import Tools</div>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => importInto('textures')}>Import to textures/</button>
            <button className="btn ghost" onClick={() => importInto('icons')}>Import to icons/</button>
            <button className="btn ghost" onClick={() => importInto('models')}>Import to models/</button>
            <button className="btn ghost" onClick={() => importInto('sounds')}>Import to sounds/</button>
          </div>

          <div className="section-title">AI Texture Prompts</div>
          <div className="btn-row">
            {AI_PROMPTS.map((p) => (
              <button key={p} className="btn ghost" onClick={() => navigator.clipboard.writeText(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}
