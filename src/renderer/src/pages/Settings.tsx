import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { SDK_VERSION } from '@shared/constants'
import { ROLE_LABELS } from '@shared/profile'
import type { DeveloperRole, Runtime } from '@shared/types'

function validNamespace(ns: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(ns) && ns.length >= 2 && ns.length <= 32
}

function validUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

interface UpdateStatus {
  status: string
  version?: string
  percent?: number
  message?: string
}

const ECHO_STUDIO_RELEASES_URL = 'https://github.com/knoxhack/ECHO-Addons-Studio/releases'
type RuntimeToolKey = 'echoNativeExecutable' | 'standaloneExecutable'
type PreviewRuntime = Extract<Runtime, 'echo_native' | 'standalone'>

export default function Settings(): JSX.Element {
  const { workspaceDir, chooseWorkspace, refresh, profile, config, moduleCatalog, moduleCatalogResult, updateProfile, updateConfig, toast } =
    useWorkspace()
  const [nsTouched, setNsTouched] = useState(false)
  const [urlTouched, setUrlTouched] = useState(false)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    const unsub = window.studio.onUpdateStatus((payload) => setUpdate(payload))
    return unsub
  }, [])

  const updateLabel = (value: UpdateStatus): string => {
    switch (value.status) {
      case 'checking': return 'Checking for updates...'
      case 'available': return `Update available: v${value.version}`
      case 'downloading': return `Downloading... ${value.percent ?? 0}%`
      case 'downloaded': return `v${value.version} ready to install`
      case 'not-available': return 'You are on the latest version.'
      case 'error': return `Update error: ${value.message}`
      default: return value.status
    }
  }

  const chooseRuntimeExecutable = async (key: RuntimeToolKey, runtime: PreviewRuntime): Promise<void> => {
    const res = await window.studio.chooseRuntimeExecutable(runtime)
    if (res.ok && res.data) {
      await updateConfig({ runtimeTools: { ...config.runtimeTools, [key]: res.data } })
      toast('Runtime executable selected')
    } else if (!res.ok) {
      toast(res.error || 'Unable to choose runtime executable')
    }
  }

  const clearRuntimeExecutable = async (key: RuntimeToolKey): Promise<void> => {
    await updateConfig({ runtimeTools: { ...config.runtimeTools, [key]: '' } })
    toast('Runtime executable cleared')
  }

  const chooseModuleRoot = async (): Promise<void> => {
    const res = await window.studio.chooseModuleRoot()
    if (res.ok && res.data) {
      await updateConfig({ moduleCatalog: { ...config.moduleCatalog, moduleRoot: res.data } })
      await refresh()
      toast('ECHO-Modules checkout selected')
    } else if (!res.ok) {
      toast(res.error || 'Unable to choose ECHO-Modules checkout')
    }
  }

  const clearModuleCatalog = async (): Promise<void> => {
    await updateConfig({ moduleCatalog: { moduleRoot: '', indexPath: '' } })
    await refresh()
    toast('Module catalog settings cleared')
  }

  const refreshModuleCatalog = async (): Promise<void> => {
    await refresh()
    toast('Module catalog refreshed')
  }

  return (
    <Page title="Settings" subtitle="Configure your creator profile, workspace, ECHO contracts, AI, preview tools, and updates. Changes persist.">
      <div className="grid cols-2">
        <div className="card">
          <h3>Account &amp; Creator</h3>
          <label className="field">
            <span>Creator name</span>
            <input
              value={profile.creatorName}
              onChange={(event) => updateProfile({ creatorName: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Creator namespace</span>
            <input
              value={profile.namespace}
              onChange={(event) => {
                updateProfile({ namespace: event.target.value })
                setNsTouched(true)
              }}
              style={{ borderColor: nsTouched && !validNamespace(profile.namespace) ? 'var(--bad)' : undefined }}
            />
            {nsTouched && !validNamespace(profile.namespace) && (
              <span style={{ color: 'var(--bad)', fontSize: 12 }}>
                Namespace must be 2-32 chars, lowercase letters/numbers/underscores, starting with a letter.
              </span>
            )}
          </label>
          <label className="field">
            <span>Role</span>
            <select value={profile.role} onChange={(event) => updateProfile({ role: event.target.value as DeveloperRole })}>
              {(Object.keys(ROLE_LABELS) as DeveloperRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={profile.verified}
              onChange={(event) => updateProfile({ verified: event.target.checked, verifiedBy: event.target.checked ? 'ECHO Labs' : undefined })}
            />
            Verified creator
          </label>
        </div>

        <div className="card">
          <h3>Workspace</h3>
          <label className="field">
            <span>Workspace folder</span>
            <input readOnly value={workspaceDir} />
          </label>
          <div className="btn-row">
            <button className="btn" onClick={chooseWorkspace}>Change Workspace</button>
            <button className="btn ghost" onClick={() => refresh()}>Rescan Projects</button>
            <button className="btn ghost" onClick={() => window.studio.openPath(workspaceDir)}>Open Folder</button>
          </div>
        </div>

        <div className="card">
          <h3>ECHO Modules</h3>
          <p className="dim" style={{ fontSize: 12 }}>
            Pin a local ECHO-Modules checkout when you want Studio to use generated module metadata, local source links, and module Gradle builds.
          </p>
          <label className="field">
            <span>Local checkout root</span>
            <input
              value={config.moduleCatalog.moduleRoot}
              placeholder="C:/Development/Github/ECHO-Modules"
              onChange={(event) =>
                updateConfig({ moduleCatalog: { ...config.moduleCatalog, moduleRoot: event.target.value } })
              }
            />
          </label>
          <label className="field">
            <span>Index path override</span>
            <input
              value={config.moduleCatalog.indexPath}
              placeholder="metadata/modules/index.json"
              onChange={(event) =>
                updateConfig({ moduleCatalog: { ...config.moduleCatalog, indexPath: event.target.value } })
              }
            />
          </label>
          <div className="btn-row" style={{ marginBottom: 8 }}>
            <span className={`badge ${moduleCatalogResult?.source === 'local-index' ? 'ready' : 'local'}`}>
              {moduleCatalogResult?.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in catalog'}
            </span>
            <span className="badge">{moduleCatalog.length} records</span>
            {moduleCatalogResult?.generatedAt && (
              <span className="dim" style={{ fontSize: 11 }}>
                generated {new Date(moduleCatalogResult.generatedAt).toLocaleString()}
              </span>
            )}
          </div>
          {moduleCatalogResult?.indexPath && (
            <div className="mono dim" style={{ fontSize: 11, marginBottom: 8, wordBreak: 'break-all' }}>
              {moduleCatalogResult.indexPath}
            </div>
          )}
          {moduleCatalogResult?.warnings.length ? (
            <div className="issue WARNING" style={{ marginBottom: 10 }}>
              <span className="lvl">WARNING</span>
              {moduleCatalogResult.warnings.join(' ')}
            </div>
          ) : null}
          <div className="btn-row">
            <button className="btn" onClick={chooseModuleRoot}>
              Browse Checkout
            </button>
            <button className="btn ghost" onClick={refreshModuleCatalog}>
              Rescan Modules
            </button>
            <button
              className="btn ghost"
              disabled={!config.moduleCatalog.moduleRoot}
              onClick={() => window.studio.openPath(config.moduleCatalog.moduleRoot)}
            >
              Open Checkout
            </button>
            <button
              className="btn ghost"
              disabled={!config.moduleCatalog.indexPath}
              onClick={() => window.studio.openPath(config.moduleCatalog.indexPath)}
            >
              Open Index
            </button>
            <button
              className="btn ghost"
              disabled={!config.moduleCatalog.moduleRoot && !config.moduleCatalog.indexPath}
              onClick={clearModuleCatalog}
            >
              Clear
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12 }}>
            Leave both fields blank to use environment and nearby-repo autodetection. If an index override is set, it takes precedence.
          </p>
        </div>

        <div className="card">
          <h3>AI Assistant</h3>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={config.ai.enabled}
              onChange={(event) => updateConfig({ ai: { ...config.ai, enabled: event.target.checked } })}
            />
            Enable AI assistant
          </label>
          <label className="field">
            <span>API key (OpenAI-compatible)</span>
            <input
              type="password"
              value={config.ai.apiKey}
              placeholder="sk-...  (leave blank to run offline)"
              onChange={(event) => updateConfig({ ai: { ...config.ai, apiKey: event.target.value } })}
            />
          </label>
          <label className="field">
            <span>Base URL</span>
            <input
              value={config.ai.baseUrl}
              onChange={(event) => {
                updateConfig({ ai: { ...config.ai, baseUrl: event.target.value } })
                setUrlTouched(true)
              }}
              style={{ borderColor: urlTouched && !validUrl(config.ai.baseUrl) ? 'var(--bad)' : undefined }}
            />
            {urlTouched && !validUrl(config.ai.baseUrl) && (
              <span style={{ color: 'var(--bad)', fontSize: 12 }}>Must be a valid URL (e.g. https://api.openai.com/v1).</span>
            )}
          </label>
          <label className="field">
            <span>Model</span>
            <input value={config.ai.model} onChange={(event) => updateConfig({ ai: { ...config.ai, model: event.target.value } })} />
          </label>
          <p className="dim" style={{ fontSize: 12 }}>
            {config.ai.apiKey ? 'Model-powered generation enabled.' : 'No key set - the assistant runs offline with deterministic generation.'}
          </p>
        </div>

        <div className="card">
          <h3>Contracts &amp; Preview</h3>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>Installed contract set: <b>{SDK_VERSION}</b></div>
            <div>Target contract set: <b>{config.sdk.targetVersion}</b></div>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={config.sdk.autoUpdate}
              onChange={(event) => updateConfig({ sdk: { ...config.sdk, autoUpdate: event.target.checked } })}
            />
            Auto-update ECHO contracts
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Default compatibility scan profile</span>
            <select value={config.preview.defaultProfile} onChange={(event) => updateConfig({ preview: { ...config.preview, defaultProfile: event.target.value } })}>
              <option value="Ashfall Compatibility">Ashfall Compatibility</option>
              <option value="ECHO Prime Compatibility">ECHO Prime Compatibility</option>
              <option value="Arcana Compatibility">Arcana Compatibility</option>
              <option value="Generic Runtime Compatibility">Generic Runtime Compatibility</option>
              <option value="Server Compatibility">Server Compatibility</option>
            </select>
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            <span>ECHO Native executable</span>
            <input
              value={config.runtimeTools.echoNativeExecutable}
              placeholder="C:/ECHO/runtime/echo-native.exe"
              onChange={(event) =>
                updateConfig({ runtimeTools: { ...config.runtimeTools, echoNativeExecutable: event.target.value } })
              }
            />
          </label>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn ghost" onClick={() => chooseRuntimeExecutable('echoNativeExecutable', 'echo_native')}>
              Browse
            </button>
            <button
              className="btn ghost"
              disabled={!config.runtimeTools.echoNativeExecutable}
              onClick={() => clearRuntimeExecutable('echoNativeExecutable')}
            >
              Clear
            </button>
          </div>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Standalone executable</span>
            <input
              value={config.runtimeTools.standaloneExecutable}
              placeholder="C:/ECHO/runtime/echo-standalone.exe"
              onChange={(event) =>
                updateConfig({ runtimeTools: { ...config.runtimeTools, standaloneExecutable: event.target.value } })
              }
            />
          </label>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn ghost" onClick={() => chooseRuntimeExecutable('standaloneExecutable', 'standalone')}>
              Browse
            </button>
            <button
              className="btn ghost"
              disabled={!config.runtimeTools.standaloneExecutable}
              onClick={() => clearRuntimeExecutable('standaloneExecutable')}
            >
              Clear
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12 }}>
            Dev Workspace setup writes these paths into gradle.properties for native and standalone preview tasks.
          </p>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Theme</span>
            <select value={config.theme} onChange={(event) => updateConfig({ theme: event.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={config.git.enabled} onChange={(event) => updateConfig({ git: { enabled: event.target.checked } })} />
            Enable Git integration
          </label>
        </div>

        <div className="card">
          <h3>Updates</h3>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>Current version: <b>{window.studio.getVersion?.() ?? '0.1.0'}</b></div>
            <div style={{ color: 'var(--text-dim)' }}>{update ? updateLabel(update) : 'Checking for updates...'}</div>
            {update?.status === 'downloaded' && (
              <button className="btn primary" style={{ marginTop: 8 }} onClick={() => window.studio.installUpdate()}>
                Install &amp; Restart
              </button>
            )}
            {update?.status === 'downloading' && (
              <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${update.percent ?? 0}%`, height: '100%', background: 'var(--accent)', transition: '0.2s' }} />
              </div>
            )}
            {update?.status === 'error' && (
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => window.studio.openExternal(ECHO_STUDIO_RELEASES_URL)}>
                Manual install from releases page
              </button>
            )}
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3>Team Members</h3>
          {profile.team.length === 0 && <p className="dim" style={{ fontSize: 12 }}>No team members. Add collaborators with roles.</p>}
          {profile.team.map((member, index) => (
            <div className="list-row" key={index} style={{ background: 'var(--bg-2)' }}>
              <input
                style={{ flex: 1 }}
                value={member.name}
                onChange={(event) => updateProfile({
                  team: profile.team.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item))
                })}
              />
              <select
                value={member.role}
                onChange={(event) => updateProfile({
                  team: profile.team.map((item, itemIndex) => (itemIndex === index ? { ...item, role: event.target.value as DeveloperRole } : item))
                })}
              >
                {(Object.keys(ROLE_LABELS) as DeveloperRole[]).map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
              <button className="btn ghost" onClick={() => updateProfile({ team: profile.team.filter((_, itemIndex) => itemIndex !== index) })}>
                Remove
              </button>
            </div>
          ))}
          <button
            className="btn ghost"
            onClick={() => {
              updateProfile({ team: [...profile.team, { name: 'New Member', role: 'tester' }] })
              toast('Team member added')
            }}
          >
            + Add member
          </button>
        </div>
      </div>
    </Page>
  )
}
