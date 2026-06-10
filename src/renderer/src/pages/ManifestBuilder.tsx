import { useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import {
  ALLOWED_PERMISSIONS,
  BLOCKED_PERMISSIONS,
  RUNTIME_LABELS,
  TARGET_LABELS
} from '@shared/constants'
import {
  addModuleToManifest,
  normalizeModuleId,
  resolveProjectModulePlan,
  type EchoModuleRecord
} from '@shared/moduleCatalog'
import type { AddonManifest, Runtime, TargetExperience } from '@shared/types'

export default function ManifestBuilder(): JSX.Element {
  const { activeProject, refresh, toast, moduleCatalog, moduleCatalogResult } = useWorkspace()
  const [m, setM] = useState<AddonManifest | null>(null)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<'form' | 'json'>('form')

  useEffect(() => {
    if (!activeProject) {
      setM(null)
      return
    }
    window.studio.readManifest(activeProject.path).then((r) => {
      if (r.ok && r.data) setM(r.data)
    })
  }, [activeProject])

  const modulePlan = useMemo(() => (m ? resolveProjectModulePlan(m, moduleCatalog) : null), [m, moduleCatalog])
  const visibleBlockedPermissions = useMemo(
    () => Object.keys(BLOCKED_PERMISSIONS).filter((permission) =>
      permission !== 'packos.policy.modify' || m?.permissions.includes(permission)
    ),
    [m?.permissions]
  )

  if (!activeProject)
    return (
      <Page title="Experience" subtitle="Shape project identity, targets, runtimes, permissions, and module dependencies.">
        <NoProject />
      </Page>
    )
  if (!m || !modulePlan)
    return (
      <Page title="Experience">
        <div className="empty">Loading project...</div>
      </Page>
    )

  const up = (patch: Partial<AddonManifest>): void => {
    setM((cur) => (cur ? { ...cur, ...patch } : cur))
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    const res = await window.studio.writeManifest(activeProject.path, m)
    if (res.ok) {
      setDirty(false)
      await refresh()
      toast('Manifest saved')
    } else toast(res.error || 'Save failed')
  }

  const togglePerm = (perm: string): void => {
    const has = m.permissions.includes(perm)
    up({ permissions: has ? m.permissions.filter((p) => p !== perm) : [...m.permissions, perm] })
  }

  const toggleRuntime = (r: Runtime): void => {
    const has = m.runtime.supports.includes(r)
    up({
      runtime: {
        ...m.runtime,
        supports: has ? m.runtime.supports.filter((x) => x !== r) : [...m.runtime.supports, r]
      }
    })
  }

  const removeModule = (mod: EchoModuleRecord): void => {
    const remove = (list: string[]): string[] => list.filter((item) => normalizeModuleId(item, moduleCatalog) !== mod.id)
    up({
      target: {
        ...m.target,
        modules: remove(m.target.modules)
      },
      dependencies: {
        required: remove(m.dependencies.required),
        optional: remove(m.dependencies.optional)
      }
    })
  }

  const toggleDep = (mod: EchoModuleRecord, kind: 'required' | 'optional'): void => {
    const list = m.dependencies[kind]
    const has = list.some((item) => normalizeModuleId(item, moduleCatalog) === mod.id)
    if (has) {
      removeModule(mod)
      return
    }
    setM((cur) => (cur ? addModuleToManifest(cur, mod, kind, moduleCatalog) : cur))
    setDirty(true)
  }

  return (
    <Page
      title="Experience"
      subtitle="Edit the project contract through guided fields, or use the JSON tab for direct manifest review."
      actions={
        <>
          <button
            className={`btn ${tab === 'form' ? 'primary' : 'ghost'}`}
            onClick={() => setTab('form')}
          >
            Form
          </button>
          <button
            className={`btn ${tab === 'json' ? 'primary' : 'ghost'}`}
            onClick={() => setTab('json')}
          >
            JSON
          </button>
          <button className="btn primary" disabled={!dirty} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <ActiveBar />

      {tab === 'json' ? (
        <div className="code">{JSON.stringify(m, null, 2)}</div>
      ) : (
        <div className="grid cols-2">
          <div className="card">
            <h3>Identity</h3>
            <label className="field">
              <span>Name</span>
              <input value={m.name} onChange={(e) => up({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>ID</span>
              <input value={m.id} onChange={(e) => up({ id: e.target.value })} />
            </label>
            <label className="field">
              <span>Version</span>
              <input value={m.version} onChange={(e) => up({ version: e.target.value })} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                value={m.description}
                onChange={(e) => up({ description: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Tags (comma separated)</span>
              <input
                value={(m.tags || []).join(', ')}
                onChange={(e) =>
                  up({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })
                }
              />
            </label>
          </div>

          <div className="card">
            <h3>Publisher</h3>
            <label className="field">
              <span>Creator / team name</span>
              <input
                value={m.publisher.name}
                onChange={(e) => up({ publisher: { ...m.publisher, name: e.target.value } })}
              />
            </label>
            <label className="field">
              <span>Namespace</span>
              <input
                value={m.namespace}
                onChange={(e) =>
                  up({ namespace: e.target.value, publisher: { ...m.publisher, id: e.target.value } })
                }
              />
            </label>
            <label className="field">
              <span>Website</span>
              <input
                value={m.publisher.website || ''}
                onChange={(e) => up({ publisher: { ...m.publisher, website: e.target.value } })}
              />
            </label>
            <label className="field">
              <span>Support / issues link</span>
              <input
                value={m.support.issues || ''}
                onChange={(e) => up({ support: { ...m.support, issues: e.target.value } })}
              />
            </label>
          </div>

          <div className="card">
            <h3>Runtime &amp; Compatibility</h3>
            {(Object.keys(RUNTIME_LABELS) as Runtime[]).map((r) => (
              <label className="checkbox" key={r}>
                <input
                  type="checkbox"
                  checked={m.runtime.supports.includes(r)}
                  onChange={() => toggleRuntime(r)}
                />
                {RUNTIME_LABELS[r]}
              </label>
            ))}
            <label className="field" style={{ marginTop: 10 }}>
              <span>Native readiness</span>
              <select
                value={m.runtime.nativeReadiness}
                onChange={(e) =>
                  up({
                    runtime: { ...m.runtime, nativeReadiness: e.target.value as 'none' | 'partial' | 'full' }
                  })
                }
              >
                <option value="none">none</option>
                <option value="partial">partial</option>
                <option value="full">full</option>
              </select>
            </label>
            <div className="field">
              <span>Target experiences</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(Object.keys(TARGET_LABELS) as TargetExperience[]).map((t) => {
                  const checked = m.target.experiences.includes(t)
                  return (
                    <label key={t} className="checkbox" style={{ marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          up({
                            target: {
                              ...m.target,
                              experiences: checked
                                ? m.target.experiences.filter((x) => x !== t)
                                : [...m.target.experiences, t]
                            }
                          })
                        }
                      />
                      {TARGET_LABELS[t]}
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Permissions</h3>
            <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
              Safe (allowed for community addons):
            </div>
            {ALLOWED_PERMISSIONS.map((p) => (
              <label className="checkbox" key={p}>
                <input
                  type="checkbox"
                  checked={m.permissions.includes(p)}
                  onChange={() => togglePerm(p)}
                />
                <span className="mono">{p}</span>
              </label>
            ))}
            <div className="dim" style={{ fontSize: 12, margin: '12px 0 8px', color: 'var(--bad)' }}>
              Reserved (blocked - for ECHO Developers only):
            </div>
            {visibleBlockedPermissions.map((p) => (
              <label className="checkbox" key={p} style={{ opacity: 0.7 }}>
                <input
                  type="checkbox"
                  checked={m.permissions.includes(p)}
                  onChange={() => togglePerm(p)}
                />
                <span className="mono" style={{ color: 'var(--bad)' }}>
                  {p}
                </span>
              </label>
            ))}
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h3>Dependencies</h3>
            <div className="btn-row" style={{ marginBottom: 10 }}>
              <span className={`badge ${moduleCatalogResult?.source === 'local-index' ? 'ready' : 'local'}`}>
                {moduleCatalogResult?.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in module catalog'}
              </span>
              <span className="badge">{modulePlan.targetModules.length} target</span>
              <span className="badge">{modulePlan.requiredModules.length} required</span>
              <span className="badge">{modulePlan.closure.length} resolved</span>
            </div>
            {moduleCatalogResult?.warnings.length ? (
              <div className="issue WARNING" style={{ marginBottom: 12 }}>
                <span className="lvl">WARNING</span>
                {moduleCatalogResult.warnings.join(' ')}
              </div>
            ) : null}
            {modulePlan.missingRequired.length > 0 && (
              <div className="issue WARNING" style={{ marginBottom: 12 }}>
                <span className="lvl">MODULES</span>
                Missing required closure: {modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.
                <div className="fix">Use the Modules page or re-add a required module here to restore the full closure.</div>
              </div>
            )}
            <div className="grid cols-2">
              <div>
                <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                  Required module closure
                </div>
                {moduleCatalog.map((module) => (
                  <label className="checkbox" key={module.id}>
                    <input
                      type="checkbox"
                      checked={m.dependencies.required.some((dep) => normalizeModuleId(dep, moduleCatalog) === module.id)}
                      onChange={() => toggleDep(module, 'required')}
                    />
                    <span className="mono">{module.name}</span>
                  </label>
                ))}
              </div>
              <div>
                <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                  Optional module integrations
                </div>
                {moduleCatalog.map((module) => (
                  <label className="checkbox" key={module.id}>
                    <input
                      type="checkbox"
                      checked={m.dependencies.optional.some((dep) => normalizeModuleId(dep, moduleCatalog) === module.id)}
                      onChange={() => toggleDep(module, 'optional')}
                    />
                    <span className="mono">{module.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}
