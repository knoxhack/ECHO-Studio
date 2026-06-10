import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/WorkspaceContext'
import { buildManifest } from '@shared/templates'
import { resolveProjectModulePlan } from '@shared/moduleCatalog'
import { RESERVED_NAMESPACE } from '@shared/constants'
import { createOptionsFromTemplate, type TemplateDef } from '@shared/templateLibrary'

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
  const currentOptions = useMemo(() => createOptionsFromTemplate(template, {
    workspaceDir,
    namespace: namespace.trim(),
    addonId: addonId.trim(),
    name: name.trim() || template.name
  }), [addonId, name, namespace, template, workspaceDir])
  const modulePlan = useMemo(() => resolveProjectModulePlan(buildManifest(currentOptions)), [currentOptions])
  const blockedModules = modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
  const moduleIssueCount = modulePlan.missingRequired.length + modulePlan.unknown.length + blockedModules.length

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
    toast(`Created ${namespace}:${addonId}. Review modules next.`)
    onClose()
    nav('/modules')
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
      <div className="card" style={{ width: 620 }} onClick={(event) => event.stopPropagation()}>
        <h3>Create from &quot;{template.name}&quot;</h3>
        <p className="dim" style={{ fontSize: 12 }}>{template.description}</p>
        <label className="field">
          <span>Creator namespace</span>
          <input value={namespace} onChange={(event) => setNamespace(event.target.value)} />
        </label>
        <label className="field">
          <span>Addon ID</span>
          <input value={addonId} onChange={(event) => setAddonId(event.target.value)} />
        </label>
        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="mono dim">Full ID: {namespace}:{addonId}</div>
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>Selected Modules</div>
            <div className="btn-row">
              {modulePlan.enabled.map((mod) => (
                <span className={`badge ${mod.blocked || mod.trustLevel === 'blocked' ? 'fixes' : 'ready'}`} key={mod.id}>
                  {mod.name}
                </span>
              ))}
              {modulePlan.enabled.length === 0 && <span className="dim">No modules selected.</span>}
            </div>
          </div>
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>Resolved Closure</div>
            <div className="btn-row">
              {modulePlan.closure.map((mod) => (
                <span className={`badge ${mod.status === 'stable' ? 'ready' : 'local'}`} key={mod.id}>
                  {mod.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        {modulePlan.optionalAvailable.length > 0 && (
          <div className="issue INFO" style={{ marginTop: 10 }}>
            <span className="lvl">OPTIONAL</span>
            Optional after creation: {modulePlan.optionalAvailable.map((mod) => mod.name).join(', ')}.
          </div>
        )}
        {moduleIssueCount > 0 && (
          <div className="issue WARNING" style={{ marginTop: 10 }}>
            <span className="lvl">MODULES</span>
            Review {moduleIssueCount} module issue{moduleIssueCount === 1 ? '' : 's'} before Dev Workspace setup.
          </div>
        )}
        {blocked && (
          <div className="issue BLOCKER" style={{ marginTop: 10 }}>
            <span className="lvl">BLOCKER</span>
            The &quot;{RESERVED_NAMESPACE}&quot; namespace is reserved.
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
            {busy ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
