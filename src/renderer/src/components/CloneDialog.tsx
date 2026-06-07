import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/WorkspaceContext'
import { RESERVED_NAMESPACE } from '@shared/constants'
import type { TemplateDef } from '@shared/templateLibrary'

// Modal that collects namespace/id/name and creates a project from a template.
export function CloneDialog({
  template,
  onClose
}: {
  template: TemplateDef
  onClose: () => void
}): JSX.Element {
  const { workspaceDir, refresh, setActiveProject, toast } = useWorkspace()
  const nav = useNavigate()
  const [namespace, setNamespace] = useState('teamnova')
  const [addonId, setAddonId] = useState(template.id)
  const [name, setName] = useState(template.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocked = namespace.trim().toLowerCase() === RESERVED_NAMESPACE
  const valid = /^[a-z0-9_]+$/.test(namespace) && /^[a-z0-9_]+$/.test(addonId) && !blocked

  const create = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await window.studio.createFromTemplate(workspaceDir, template.id, namespace.trim(), addonId.trim(), name.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Failed to create project')
      return
    }
    await refresh()
    if (res.data) setActiveProject(res.data)
    toast(`Created ${namespace}:${addonId}`)
    onClose()
    nav('/manifest')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 200
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3>Create from “{template.name}”</h3>
        <p className="dim" style={{ fontSize: 12 }}>{template.description}</p>
        <label className="field">
          <span>Creator namespace</span>
          <input value={namespace} onChange={(e) => setNamespace(e.target.value)} />
        </label>
        <label className="field">
          <span>Addon ID</span>
          <input value={addonId} onChange={(e) => setAddonId(e.target.value)} />
        </label>
        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="mono dim">Full ID: {namespace}:{addonId}</div>
        {blocked && (
          <div className="issue BLOCKER" style={{ marginTop: 10 }}>
            <span className="lvl">BLOCKER</span>
            The “{RESERVED_NAMESPACE}” namespace is reserved.
          </div>
        )}
        {error && (
          <div className="issue ERROR" style={{ marginTop: 10 }}>
            <span className="lvl">ERROR</span>
            {error}
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid || busy} onClick={create}>
            {busy ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
