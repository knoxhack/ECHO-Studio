import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { SDK_VERSION } from '@shared/constants'
import { ROLE_LABELS } from '@shared/profile'
import type { DeveloperRole } from '@shared/types'

function validNamespace(ns: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(ns) && ns.length >= 2 && ns.length <= 32
}
function validUrl(u: string): boolean {
  try { new URL(u); return true } catch { return false }
}

interface UpdateStatus {
  status: string
  version?: string
  percent?: number
  message?: string
}
const ADDON_STUDIO_RELEASES_URL = 'https://github.com/knoxhack/ECHO-Addons-Studio/releases'

export default function Settings(): JSX.Element {
  const { workspaceDir, chooseWorkspace, refresh, profile, config, updateProfile, updateConfig, toast } =
    useWorkspace()
  const [nsTouched, setNsTouched] = useState(false)
  const [urlTouched, setUrlTouched] = useState(false)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    const unsub = window.studio.onUpdateStatus((payload) => setUpdate(payload))
    return unsub
  }, [])

  const updateLabel = (u: UpdateStatus): string => {
    switch (u.status) {
      case 'checking': return 'Checking for updates…'
      case 'available': return `Update available: v${u.version}`
      case 'downloading': return `Downloading… ${u.percent ?? 0}%`
      case 'downloaded': return `v${u.version} ready to install`
      case 'not-available': return 'You are on the latest version.'
      case 'error': return `Update error: ${u.message}`
      default: return u.status
    }
  }

  return (
    <Page title="Settings" subtitle="Configure your creator profile, workspace, SDK, AI and sandbox. Changes persist.">
      <div className="grid cols-2">
        <div className="card">
          <h3>Account &amp; Creator</h3>
          <label className="field">
            <span>Creator name</span>
            <input
              value={profile.creatorName}
              onChange={(e) => updateProfile({ creatorName: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Creator namespace</span>
            <input
              value={profile.namespace}
              onChange={(e) => { updateProfile({ namespace: e.target.value }); setNsTouched(true) }}
              style={{ borderColor: nsTouched && !validNamespace(profile.namespace) ? 'var(--bad)' : undefined }}
            />
            {nsTouched && !validNamespace(profile.namespace) && (
              <span style={{ color: 'var(--bad)', fontSize: 12 }}>Namespace must be 2–32 chars, lowercase letters/numbers/underscores, starting with a letter.</span>
            )}
          </label>
          <label className="field">
            <span>Role</span>
            <select value={profile.role} onChange={(e) => updateProfile({ role: e.target.value as DeveloperRole })}>
              {(Object.keys(ROLE_LABELS) as DeveloperRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={profile.verified} onChange={(e) => updateProfile({ verified: e.target.checked, verifiedBy: e.target.checked ? 'ECHO Labs' : undefined })} />
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
          <h3>AI Assistant</h3>
          <label className="checkbox">
            <input type="checkbox" checked={config.ai.enabled} onChange={(e) => updateConfig({ ai: { ...config.ai, enabled: e.target.checked } })} />
            Enable AI assistant
          </label>
          <label className="field">
            <span>API key (OpenAI-compatible)</span>
            <input
              type="password"
              value={config.ai.apiKey}
              placeholder="sk-…  (leave blank to run offline)"
              onChange={(e) => updateConfig({ ai: { ...config.ai, apiKey: e.target.value } })}
            />
          </label>
          <label className="field">
            <span>Base URL</span>
            <input
              value={config.ai.baseUrl}
              onChange={(e) => { updateConfig({ ai: { ...config.ai, baseUrl: e.target.value } }); setUrlTouched(true) }}
              style={{ borderColor: urlTouched && !validUrl(config.ai.baseUrl) ? 'var(--bad)' : undefined }}
            />
            {urlTouched && !validUrl(config.ai.baseUrl) && (
              <span style={{ color: 'var(--bad)', fontSize: 12 }}>Must be a valid URL (e.g. https://api.openai.com/v1).</span>
            )}
          </label>
          <label className="field">
            <span>Model</span>
            <input value={config.ai.model} onChange={(e) => updateConfig({ ai: { ...config.ai, model: e.target.value } })} />
          </label>
          <p className="dim" style={{ fontSize: 12 }}>
            {config.ai.apiKey ? 'Model-powered generation enabled.' : 'No key set — the assistant runs offline with deterministic generation.'}
          </p>
        </div>

        <div className="card">
          <h3>SDK &amp; Sandbox</h3>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>Installed SDK: <b>{SDK_VERSION}</b></div>
            <div>Target SDK: <b>{config.sdk.targetVersion}</b></div>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={config.sdk.autoUpdate} onChange={(e) => updateConfig({ sdk: { ...config.sdk, autoUpdate: e.target.checked } })} />
            Auto-update SDK
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Default sandbox profile</span>
            <select value={config.sandbox.defaultProfile} onChange={(e) => updateConfig({ sandbox: { ...config.sandbox, defaultProfile: e.target.value } })}>
              <option>Ashfall Sandbox</option>
              <option>ECHO Prime Sandbox</option>
              <option>Arcana Sandbox</option>
              <option>Generic ECHO Runtime Sandbox</option>
              <option>Server Sandbox</option>
            </select>
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Theme</span>
            <select value={config.theme} onChange={(e) => updateConfig({ theme: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={config.git.enabled} onChange={(e) => updateConfig({ git: { enabled: e.target.checked } })} />
            Enable Git integration
          </label>
        </div>

        <div className="card">
          <h3>Updates</h3>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>Current version: <b>{window.studio.getVersion?.() ?? '0.1.0'}</b></div>
            <div style={{ color: 'var(--text-dim)' }}>{update ? updateLabel(update) : 'Checking for updates…'}</div>
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
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => window.studio.openExternal(ADDON_STUDIO_RELEASES_URL)}>
                Manual install from releases page
              </button>
            )}
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3>Team Members</h3>
          {profile.team.length === 0 && <p className="dim" style={{ fontSize: 12 }}>No team members. Add collaborators with roles.</p>}
          {profile.team.map((m, i) => (
            <div className="list-row" key={i} style={{ background: 'var(--bg-2)' }}>
              <input
                style={{ flex: 1 }}
                value={m.name}
                onChange={(e) => updateProfile({ team: profile.team.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              />
              <select
                value={m.role}
                onChange={(e) => updateProfile({ team: profile.team.map((x, j) => (j === i ? { ...x, role: e.target.value as DeveloperRole } : x)) })}
              >
                {(Object.keys(ROLE_LABELS) as DeveloperRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button className="btn ghost" onClick={() => updateProfile({ team: profile.team.filter((_, j) => j !== i) })}>✕</button>
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
