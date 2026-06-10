import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import {
  ECHO_MODULE_CATALOG,
  addModuleToManifest,
  addRequiredModuleClosureToManifest,
  findEchoModule,
  modulesForCapability,
  normalizeModuleId,
  resolveProjectModulePlan,
  type EchoModuleCatalogResult,
  type EchoModuleRecord
} from '@shared/moduleCatalog'
import type { DevTaskId, DevTaskRun, DevWorkspaceState } from '@shared/devWorkspace'
import type { AddonManifest } from '@shared/types'

const FILTERS = ['All', 'Enabled', 'Foundation', 'UI', 'World', 'Tech', 'Developer'] as const
type Filter = (typeof FILTERS)[number]

const CAPABILITIES = [
  ['Missions', 'missions'],
  ['Recipes', 'recipes'],
  ['Interface', 'interface'],
  ['Map', 'map'],
  ['Knowledge', 'knowledge'],
  ['Developer', 'developer']
] as const

function taskOutput(run: DevTaskRun): string {
  return [run.stdout, run.stderr].filter(Boolean).join('\n') || `${run.artifacts.length} artifact(s) detected.`
}

export default function Modules(): JSX.Element {
  const { activeProject, config, refresh, toast } = useWorkspace()
  const nav = useNavigate()
  const [manifest, setManifest] = useState<AddonManifest | null>(null)
  const [catalog, setCatalog] = useState<EchoModuleRecord[]>(ECHO_MODULE_CATALOG)
  const [catalogResult, setCatalogResult] = useState<EchoModuleCatalogResult | null>(null)
  const [devWorkspace, setDevWorkspace] = useState<DevWorkspaceState | null>(null)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [moduleTaskBusy, setModuleTaskBusy] = useState(false)
  const [moduleTaskRun, setModuleTaskRun] = useState<DevTaskRun | null>(null)
  const [filter, setFilter] = useState<Filter>('All')
  const [selectedId, setSelectedId] = useState('echomissioncore')

  const loadCatalog = (projectPath?: string): void => {
    window.studio
      .listEchoModules(projectPath)
      .then((result) => {
        if (result.ok && result.data) {
          setCatalog(result.data.catalog)
          setCatalogResult(result.data)
        }
      })
      .catch((error) => {
        setCatalog(ECHO_MODULE_CATALOG)
        setCatalogResult({
          catalog: ECHO_MODULE_CATALOG,
          source: 'builtin',
          warnings: [`Could not load local module catalog: ${error instanceof Error ? error.message : String(error)}`]
        })
      })
  }

  const loadDevWorkspace = (projectPath: string): void => {
    window.studio.inspectDevWorkspace(projectPath).then((result) => {
      setDevWorkspace(result.ok && result.data ? result.data : null)
    })
  }

  useEffect(() => {
    if (!activeProject) {
      setManifest(null)
      setDevWorkspace(null)
      loadCatalog()
      return
    }
    window.studio.readManifest(activeProject.path).then((result) => {
      if (result.ok && result.data) setManifest(result.data)
    })
    loadCatalog(activeProject.path)
    loadDevWorkspace(activeProject.path)
  }, [activeProject])

  const plan = useMemo(() => manifest ? resolveProjectModulePlan(manifest, catalog) : null, [manifest, catalog])
  const selected = findEchoModule(selectedId, catalog) ?? catalog[0] ?? ECHO_MODULE_CATALOG[0]
  const enabledIds = new Set(plan?.enabled.map((mod) => mod.id) ?? [])

  if (!activeProject) {
    return (
      <Page title="Modules" subtitle="Choose the ECHO modules that power your experience.">
        <NoProject />
      </Page>
    )
  }

  if (!manifest || !plan) {
    return (
      <Page title="Modules">
        <div className="empty">Loading module catalog...</div>
      </Page>
    )
  }

  const filtered = catalog.filter((mod) => {
    if (filter === 'Enabled') return enabledIds.has(mod.id)
    if (filter === 'Foundation') return mod.kind === 'foundation'
    if (filter === 'UI') return mod.kind === 'ui_pack'
    if (filter === 'World') return mod.kind === 'world' || mod.role === 'world' || mod.role === 'map'
    if (filter === 'Tech') return mod.kind === 'tech' || ['recipes', 'networking', 'data'].includes(mod.role)
    if (filter === 'Developer') return mod.kind === 'developer_tool'
    return true
  })

  const saveManifest = async (next: AddonManifest, message: string): Promise<void> => {
    const result = await window.studio.writeManifest(activeProject.path, next)
    if (result.ok) {
      setManifest(next)
      await refresh()
      toast(message)
      loadDevWorkspace(activeProject.path)
    } else {
      toast(result.error || 'Manifest update failed')
    }
  }

  const addModule = (mod: EchoModuleRecord, kind: 'required' | 'optional'): void => {
    const next = addModuleToManifest(manifest, mod, kind, catalog)
    const suffix = kind === 'required' ? ' with required dependencies' : ' with required dependencies preserved'
    void saveManifest(next, `${mod.name} added as ${kind}${suffix}`)
  }

  const addClosure = (mod: EchoModuleRecord): void => {
    const next = addRequiredModuleClosureToManifest(manifest, [mod], catalog)
    void saveManifest(next, `Added ${mod.name} and required dependencies`)
  }

  const removeModule = (mod: EchoModuleRecord): void => {
    const remove = (list: string[]): string[] => list.filter((id) => normalizeModuleId(id, catalog) !== mod.id)
    const next: AddonManifest = {
      ...manifest,
      target: {
        ...manifest.target,
        modules: remove(manifest.target.modules)
      },
      dependencies: {
        required: remove(manifest.dependencies.required),
        optional: remove(manifest.dependencies.optional)
      }
    }
    void saveManifest(next, `${mod.name} removed`)
  }

  const refreshDevWorkspace = async (): Promise<void> => {
    if (!manifest) return
    const alreadySetUp = Boolean(devWorkspace?.lastSetupAt)
    setWorkspaceBusy(true)
    const result = await window.studio.setupDevWorkspace(activeProject.path, {
      mode: alreadySetUp ? devWorkspace!.mode : 'gradle',
      runtimes: alreadySetUp && devWorkspace!.runtimeTargets.length > 0 ? devWorkspace!.runtimeTargets : manifest.runtime.supports,
      force: false,
      runtimeTools: {
        echoNativeExecutable: config.runtimeTools.echoNativeExecutable,
        standaloneExecutable: config.runtimeTools.standaloneExecutable
      }
    })
    setWorkspaceBusy(false)
    if (result.ok && result.data) {
      setDevWorkspace(result.data.state)
      toast(alreadySetUp ? 'Dev workspace module locks refreshed' : 'Gradle dev workspace ready')
    } else {
      toast(result.error || (alreadySetUp ? 'Dev workspace refresh failed' : 'Dev workspace setup failed'))
    }
  }

  const runModuleTask = async (taskId: DevTaskId): Promise<void> => {
    setModuleTaskBusy(true)
    try {
      const result = await window.studio.runDevTask(activeProject.path, taskId)
      if (result.ok && result.data) {
        setModuleTaskRun(result.data)
        toast(`${taskId} ${result.data.status}`)
        loadDevWorkspace(activeProject.path)
      } else {
        toast(result.error || `${taskId} failed`)
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : `${taskId} failed`)
    } finally {
      setModuleTaskBusy(false)
    }
  }

  const statusColor = (status: EchoModuleRecord['status']): string => {
    if (status === 'stable') return 'var(--good)'
    if (status === 'beta') return 'var(--accent)'
    if (status === 'experimental') return 'var(--warn)'
    return 'var(--text-faint)'
  }

  const trustBadgeClass = (mod: EchoModuleRecord): string => {
    if (mod.blocked || mod.trustLevel === 'blocked') return 'fixes'
    if (mod.trustLevel === 'official' || mod.trustLevel === 'trusted') return 'ready'
    return 'local'
  }

  const workspaceCurrent = Boolean(devWorkspace?.lastSetupAt && devWorkspace.moduleLock.upToDate && devWorkspace.moduleWorkspace.upToDate)
  const workspaceLabel = !devWorkspace?.lastSetupAt ? 'Not Set Up' : workspaceCurrent ? 'Current' : 'Stale'
  const gradleDependencyIssues = devWorkspace?.moduleWorkspace.gradleDependencyIssues ?? []
  const localSourceCount = plan.closure.filter((mod) => mod.moduleDir || mod.descriptorPath).length
  const moduleToolDisabledReason = (taskId: DevTaskId): string | null => {
    if (catalogResult?.source !== 'local-index') return 'Local ECHO-Modules index is required.'
    if (taskId === 'modules:releaseSelected' && !workspaceCurrent) return 'Refresh Dev Workspace locks and map first.'
    if (taskId === 'modules:releaseSelected' && localSourceCount === 0) return 'No selected module closure entries are linked to local ECHO-Modules source.'
    return null
  }

  return (
    <Page
      title="Modules"
      subtitle="A project-aware map of ECHO Modules, dependencies, capabilities, runtimes, and release readiness."
      actions={
        <>
          <button className="btn" onClick={() => addClosure(selected)}>Add Closure</button>
          <button className="btn" onClick={() => loadCatalog(activeProject.path)}>Refresh Catalog</button>
          <button className="btn primary" onClick={() => addModule(selected, 'required')}>Add Required</button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Metric label="Target Modules" value={String(plan.targetModules.length)} />
        <Metric label="Resolved Modules" value={String(plan.closure.length)} />
        <Metric label="Missing Required" value={String(plan.missingRequired.length)} tone={plan.missingRequired.length ? 'var(--warn)' : 'var(--good)'} />
        <Metric label="Unknown" value={String(plan.unknown.length)} tone={plan.unknown.length ? 'var(--bad)' : 'var(--good)'} />
      </div>

      {catalogResult && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge ${catalogResult.source === 'local-index' ? 'ready' : 'local'}`}>
            {catalogResult.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in catalog'}
          </span>
            <span className="dim" style={{ fontSize: 11 }}>{catalog.length} records</span>
            {catalogResult.indexPath && <span className="mono dim" style={{ fontSize: 11 }}>{catalogResult.indexPath}</span>}
            {catalogResult.generatedAt && <span className="dim" style={{ fontSize: 11 }}>generated {new Date(catalogResult.generatedAt).toLocaleString()}</span>}
            {catalogResult.moduleRoot && (
              <button className="btn ghost" onClick={() => window.studio.openPath(catalogResult.moduleRoot!)}>
                Open Modules Root
              </button>
            )}
            {catalogResult.indexPath && (
              <button className="btn ghost" onClick={() => window.studio.openPath(catalogResult.indexPath!)}>
                Open Index
              </button>
            )}
          </div>
          {catalogResult.warnings.length > 0 && (
            <div className="issue WARNING" style={{ marginTop: 10 }}>
              <span className="lvl">WARNING</span>
              {catalogResult.warnings.join(' ')}
            </div>
          )}
          <div className="section-title">Local ECHO-Modules Tools</div>
          <div className="btn-row">
            {([
              ['modules:validate', 'Validate Graph'],
              ['modules:releaseSelected', 'Generate Selected Release'],
              ['modules:verifyRelease', 'Verify Release Assets']
            ] as Array<[DevTaskId, string]>).map(([taskId, label]) => {
              const reason = moduleToolDisabledReason(taskId)
              return (
                <button
                  key={taskId}
                  className="btn"
                  disabled={moduleTaskBusy || Boolean(reason)}
                  title={reason ?? label}
                  onClick={() => { void runModuleTask(taskId) }}
                >
                  {moduleTaskBusy ? 'Working...' : label}
                </button>
              )
            })}
          </div>
          {moduleTaskRun && (
            <div className={`issue ${moduleTaskRun.status === 'completed' ? 'INFO' : 'WARNING'}`} style={{ marginTop: 10 }}>
              <span className="lvl">{moduleTaskRun.status.toUpperCase()}</span>
              {moduleTaskRun.command}
              <div className="fix">
                {taskOutput(moduleTaskRun)}
              </div>
              {moduleTaskRun.logPath && (
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => window.studio.openPath(moduleTaskRun.logPath!)}>
                  Open Task Log
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {devWorkspace && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={`badge ${workspaceCurrent ? 'ready' : 'fixes'}`}>Dev Workspace {workspaceLabel}</span>
            <span className={`badge ${devWorkspace.moduleLock.upToDate ? 'ready' : 'local'}`}>
              Lock {devWorkspace.moduleLock.upToDate ? 'current' : 'stale'}
            </span>
            <span className={`badge ${devWorkspace.moduleWorkspace.upToDate ? 'ready' : 'local'}`}>
              Map {devWorkspace.moduleWorkspace.upToDate ? 'current' : 'stale'}
            </span>
            <span className="badge">{devWorkspace.moduleWorkspace.localModuleCount}/{devWorkspace.moduleWorkspace.moduleCount} local sources</span>
            <span className={`badge ${(devWorkspace.moduleWorkspace.gradleBuildCount ?? 0) > 0 ? 'ready' : 'local'}`}>
              {devWorkspace.moduleWorkspace.gradleBuildCount ?? 0} Gradle builds
            </span>
            <span className={`badge ${(devWorkspace.moduleWorkspace.gradleDependencyReadyCount ?? 0) > 0 ? 'ready' : 'local'}`}>
              {devWorkspace.moduleWorkspace.gradleDependencyReadyCount ?? 0} compile deps
            </span>
            <button className="btn ghost" onClick={() => nav('/dev-workspace')}>Open Dev Workspace</button>
            <button className="btn" disabled={workspaceBusy} onClick={refreshDevWorkspace}>
              {workspaceBusy ? 'Working...' : devWorkspace.lastSetupAt ? 'Refresh Locks & Map' : 'Set Up Gradle Workspace'}
            </button>
          </div>
          {!workspaceCurrent && devWorkspace.lastSetupAt && (
            <div className="issue WARNING" style={{ marginTop: 10 }}>
              <span className="lvl">WARNING</span>
              Module selections changed after workspace setup.
              <div className="fix">Refresh generated module locks and the local source map before running clients, builds, preview, or packaging.</div>
            </div>
          )}
          {gradleDependencyIssues.length > 0 && (
            <div className="issue WARNING" style={{ marginTop: 10 }}>
              <span className="lvl">GRADLE</span>
              Some local module builds are not wired into compile dependencies.
              <div className="fix">
                {gradleDependencyIssues.map((issue) => (
                  `${issue.moduleName} missing ${issue.missingProjectDependencies.join(', ')}`
                )).join('; ')}. Add those projects/modules to the closure, then refresh locks and map.
              </div>
            </div>
          )}
        </div>
      )}

      {plan.missingRequired.length > 0 && (
        <div className="issue WARNING" style={{ marginBottom: 16 }}>
          <span className="lvl">WARNING</span>
          Dependency closure is incomplete. Add missing modules: {plan.missingRequired.map((mod) => mod.name).join(', ')}.
          <div className="btn-row" style={{ marginTop: 8 }}>
            {plan.missingRequired.map((mod) => (
              <button key={mod.id} className="btn ghost" onClick={() => addModule(mod, 'required')}>
                Add {mod.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Capability Picker</h3>
          <p className="dim" style={{ fontSize: 12 }}>
            Pick outcomes first. Studio translates them into module dependencies.
          </p>
          <div className="grid cols-3" style={{ gap: 8 }}>
            {CAPABILITIES.map(([label, capability]) => (
              <button
                key={capability}
                className="tile"
                style={{ textAlign: 'left', padding: 12 }}
                onClick={() => {
                  const mods = modulesForCapability(capability, catalog)
                  const next = addRequiredModuleClosureToManifest(manifest, mods, catalog)
                  void saveManifest(next, `${label} modules and dependencies added`)
                }}
              >
                <h4>{label}</h4>
                <p>{modulesForCapability(capability, catalog).map((mod) => mod.name).join(', ')}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Dependency Graph</h3>
          {plan.closure.length === 0 ? (
            <p className="dim">No ECHO modules declared yet.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {plan.closure.map((mod, index) => (
                <div key={mod.id} className="badge" style={{ color: enabledIds.has(mod.id) ? 'var(--accent)' : 'var(--warn)' }}>
                  {index + 1}. {mod.name}{enabledIds.has(mod.id) ? '' : ' needed'}
                </div>
              ))}
            </div>
          )}
          {plan.optionalAvailable.length > 0 && (
            <>
              <div className="section-title">Optional Integrations</div>
              <div className="btn-row">
                {plan.optionalAvailable.slice(0, 8).map((mod) => (
                  <button key={mod.id} className="btn ghost" onClick={() => addModule(mod, 'optional')}>
                    {mod.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        {FILTERS.map((item) => (
          <button key={item} className={`btn ${filter === item ? 'primary' : 'ghost'}`} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
        <div className="grid cols-2">
          {filtered.map((mod) => {
            const enabled = enabledIds.has(mod.id)
            return (
              <button
                key={mod.id}
                className={`tile ${selected.id === mod.id ? 'selected' : ''}`}
                style={{ textAlign: 'left' }}
                onClick={() => setSelectedId(mod.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 style={{ flex: 1 }}>{mod.name}</h4>
                  <span className={`badge ${enabled ? 'ready' : 'local'}`}>{enabled ? 'Enabled' : mod.channel}</span>
                </div>
                <p>{mod.creatorUse}</p>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <span className="badge" style={{ color: statusColor(mod.status) }}>{mod.status}</span>
                  <span className="badge">{mod.role}</span>
                  {mod.trustLevel && <span className={`badge ${trustBadgeClass(mod)}`}>{mod.trustLevel}</span>}
                  {(mod.blocked || mod.trustLevel === 'blocked') && <span className="badge fixes">Blocked</span>}
                  {mod.standaloneReady && <span className="badge ready">Standalone</span>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="card" style={{ position: 'sticky', top: 0 }}>
          <h3>{selected.name}</h3>
          <p className="dim" style={{ fontSize: 13 }}>{selected.creatorUse}</p>
          <div style={{ fontSize: 12, lineHeight: 1.9 }}>
            <div>ID: <span className="mono">{selected.id}</span></div>
            {selected.version && <div>Version: {selected.version}</div>}
            <div>Status: <b style={{ color: statusColor(selected.status) }}>{selected.status}</b></div>
            <div>Trust: <b>{selected.trustLevel ?? 'community'}</b></div>
            <div>Channel: {selected.channel}</div>
            <div>API: {selected.publicApi}</div>
            <div>Role: {selected.role}</div>
            <div>Runtimes: {selected.runtimes.join(', ')}</div>
            <div>Launcher visible: {selected.launcherVisible ? 'yes' : 'no'}</div>
            <div>Ashfall required: {selected.ashfallRequired ? 'yes' : 'no'}</div>
          </div>

          <div className="section-title">Provides</div>
          {(selected.blocked || selected.trustLevel === 'blocked') && (
            <div className="issue BLOCKER" style={{ marginBottom: 10 }}>
              <span className="lvl">BLOCKER</span>
              This module is blocked for public releases.
              {selected.blockReason && <div className="fix">{selected.blockReason}</div>}
            </div>
          )}
          {selected.trustLevel === 'sandboxed' && (
            <div className="issue WARNING" style={{ marginBottom: 10 }}>
              <span className="lvl">WARNING</span>
              Sandboxed module. Public publishing may require additional review.
            </div>
          )}
          <div className="btn-row">
            {selected.provides.map((item) => <span className="badge" key={item}>{item}</span>)}
          </div>

          <div className="section-title">Requires</div>
          {selected.requires.length === 0 ? (
            <p className="dim" style={{ fontSize: 12 }}>No required module dependencies.</p>
          ) : (
            selected.requires.map((id) => {
              const dep = findEchoModule(id, catalog)
              return (
                <div className="list-row" key={id} style={{ padding: '6px 8px' }}>
                  <span style={{ flex: 1 }}>{dep?.name ?? id}</span>
                  <span className={`badge ${enabledIds.has(normalizeModuleId(id, catalog)) ? 'ready' : 'local'}`}>
                    {enabledIds.has(normalizeModuleId(id, catalog)) ? 'set' : 'needed'}
                  </span>
                </div>
              )
            })
          )}

          <div className="btn-row" style={{ marginTop: 14 }}>
            {selected.source && <span className="badge">{selected.source}</span>}
            {enabledIds.has(selected.id) ? (
              <button className="btn" onClick={() => removeModule(selected)}>Remove</button>
            ) : (
              <>
                <button className="btn" onClick={() => addModule(selected, 'optional')}>Add Optional</button>
                <button className="btn primary" onClick={() => addModule(selected, 'required')}>Add Required</button>
              </>
            )}
            <button className="btn ghost" onClick={() => addClosure(selected)}>Add Closure</button>
          </div>
          {(selected.moduleDir || selected.descriptorPath) && (
            <div className="btn-row" style={{ marginTop: 10 }}>
              {selected.moduleDir && (
                <button className="btn ghost" onClick={() => window.studio.openPath(selected.moduleDir!)}>
                  Open Module Folder
                </button>
              )}
              {selected.descriptorPath && (
                <button className="btn ghost" onClick={() => window.studio.openPath(selected.descriptorPath!)}>
                  Open Descriptor
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ color: tone ?? 'var(--accent)' }}>{value}</div>
    </div>
  )
}
