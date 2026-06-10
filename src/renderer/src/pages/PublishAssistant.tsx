import { useCallback, useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { GitHubPublishingStatus, PackageResult, ReleaseIndexHandoffAsset } from '@shared/publishing'

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function parentPath(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, '')
}

function formatBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function providerLabel(status: GitHubPublishingStatus | null): string {
  if (!status) return 'Checking'
  if (status.activeProvider === 'github-app') return 'GitHub App'
  if (status.activeProvider === 'gh-cli') return 'GitHub CLI'
  return 'Offline'
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ fontSize: 20, color: tone ?? 'var(--accent)' }}>
        {value}
      </div>
    </div>
  )
}

function StepRow({
  done,
  label,
  detail
}: {
  done: boolean
  label: string
  detail: string
}): JSX.Element {
  return (
    <div className="list-row" style={{ padding: '9px 10px' }}>
      <span className={`badge ${done ? 'ready' : 'local'}`}>{done ? 'Ready' : 'Pending'}</span>
      <div style={{ flex: 1 }}>
        <b>{label}</b>
        <div className="dim" style={{ fontSize: 12 }}>
          {detail}
        </div>
      </div>
    </div>
  )
}

export default function PublishAssistant(): JSX.Element {
  const { activeProject, toast } = useWorkspace()
  const [owner, setOwner] = useState('knoxhack')
  const [repo, setRepo] = useState('')
  const [tag, setTag] = useState('v0.1.0')
  const [draft, setDraft] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [pkg, setPkg] = useState<PackageResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [releaseUrl, setReleaseUrl] = useState('')
  const [authStatus, setAuthStatus] = useState<GitHubPublishingStatus | null>(null)

  const refreshAuth = useCallback(async () => {
    const result = await window.studio.getGitHubPublishingStatus()
    if (result.ok && result.data) setAuthStatus(result.data)
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    if (!activeProject) {
      setPkg(null)
      setStatus(null)
      setReleaseUrl('')
      return
    }
    const manifest = activeProject.manifest
    const localId = manifest.id.includes(':') ? manifest.id.split(':')[1] : manifest.id
    setOwner(manifest.publisher.id || manifest.namespace || 'knoxhack')
    setRepo(`${localId}-addon`)
    setTag(`v${manifest.version}`)
  }, [activeProject])

  const handoffAssets = useMemo<ReleaseIndexHandoffAsset[]>(() => pkg?.releaseIndexHandoff?.assets ?? [], [pkg])
  const assetCount = handoffAssets.length || pkg?.assetPaths.length || 0

  const packageProject = async (): Promise<void> => {
    if (!activeProject) {
      setStatus('Select an addon project first.')
      return
    }
    setBusy(true)
    setReleaseUrl('')
    try {
      const result = await window.studio.packageAddon(activeProject.path)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'Package build failed.')
      const next = result.data
      setPkg(next)
      setStatus(`Prepared ${fileName(next.zipPath)}.`)
      if (next.releaseIndexHandoff?.sourceRepo) {
        const [nextOwner, nextRepo] = next.releaseIndexHandoff.sourceRepo.split('/')
        if (nextOwner) setOwner(nextOwner)
        if (nextRepo) setRepo(nextRepo)
      }
      if (next.releaseIndexHandoff?.releaseTag) setTag(next.releaseIndexHandoff.releaseTag)
      toast('Release assets prepared')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Package build failed.')
    } finally {
      setBusy(false)
    }
  }

  const connectRepo = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.studio.connectGitHubRepo(owner, repo)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'Repository connection failed.')
      setStatus(result.data.message)
      if (result.data.exists) toast(`Connected ${owner}/${repo}`)
      await refreshAuth()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Repository connection failed.')
    } finally {
      setBusy(false)
    }
  }

  const startAppLogin = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.studio.startGitHubAppLogin()
      if (!result.ok || !result.data) throw new Error(result.error ?? 'GitHub App login failed.')
      const url = result.data.authorizeUrl || result.data.installUrl
      if (url) await window.studio.openExternal(url)
      setStatus(result.data.message)
      await refreshAuth()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GitHub App login failed.')
    } finally {
      setBusy(false)
    }
  }

  const createDraft = async (): Promise<void> => {
    if (!pkg?.releaseDraftPath) {
      setStatus('Prepare local release assets before creating a GitHub draft.')
      return
    }
    setBusy(true)
    try {
      const result = await window.studio.createGitHubReleaseDraft(pkg.releaseDraftPath, owner, repo, tag, draft)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'GitHub release draft failed.')
      setReleaseUrl(result.data.url ?? '')
      setStatus(`Created release draft ${result.data.tag}.`)
      toast('GitHub release draft created')
      await refreshAuth()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GitHub release draft failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!activeProject) {
    return (
      <Page title="Release Builder" subtitle="Build local release assets, checksums, echo-release.json, and Release Index handoff files.">
        <NoProject />
      </Page>
    )
  }

  const sdkReady = pkg?.sdkValidation.ok ?? false
  const packosReady = pkg?.report.publishingReady ?? false
  const packageReady = Boolean(pkg?.checksumsPath && pkg.releaseManifestPath && pkg.releaseDraftPath)
  const publishReady = Boolean(pkg?.releaseDraftPath && owner.trim() && repo.trim() && tag.trim())

  return (
    <Page
      title="Release Builder"
      subtitle="Local-first release preparation: package assets, verify checksums, preview Release Index ingestion, then optionally publish a GitHub draft."
      actions={
        <>
          <button className="btn" disabled={busy} onClick={refreshAuth}>
            Refresh Auth
          </button>
          <button className="btn primary" disabled={busy} onClick={packageProject}>
            {busy ? 'Working...' : 'Prepare Assets'}
          </button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Metric label="SDK Contract" value={sdkReady ? 'Ready' : pkg ? 'Issues' : 'Pending'} tone={sdkReady ? 'var(--good)' : pkg ? 'var(--bad)' : 'var(--warn)'} />
        <Metric label="PackOS" value={pkg ? `${pkg.report.compatibilityScore}%` : 'Pending'} tone={packosReady ? 'var(--good)' : pkg ? 'var(--warn)' : 'var(--text-faint)'} />
        <Metric label="Assets" value={String(assetCount)} tone={assetCount ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Publish Auth" value={providerLabel(authStatus)} tone={authStatus?.activeProvider === 'none' ? 'var(--warn)' : 'var(--good)'} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Local Release Pipeline</h3>
          <StepRow done={sdkReady} label="SDK package contract" detail={pkg ? (sdkReady ? 'Package manifest passes SDK validation.' : `${pkg.sdkValidation.issues.length} issue(s) found.`) : 'Run Prepare Assets to validate echo-addon-package.json.'} />
          <StepRow done={packosReady} label="PackOS project validation" detail={pkg ? `Blockers ${pkg.report.counts.BLOCKER} - Errors ${pkg.report.counts.ERROR}` : 'Run project validation as part of the package build.'} />
          <StepRow done={packageReady} label="Release sidecars" detail="Write checksums.sha256, echo-release.json, github-release-draft.json, and release-index-handoff.json." />
          <StepRow done={Boolean(releaseUrl)} label="Optional GitHub draft" detail={releaseUrl || 'Upload prepared local assets after reviewing them.'} />

          {status && (
            <div className="issue INFO" style={{ marginTop: 12 }}>
              <span className="lvl">INFO</span>
              {status}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={packageProject} disabled={busy}>
              Prepare Assets
            </button>
            <button className="btn ghost" onClick={() => pkg?.zipPath && window.studio.openPath(parentPath(pkg.zipPath))} disabled={!pkg?.zipPath}>
              Open Release Folder
            </button>
            <button className="btn ghost" onClick={() => pkg?.releaseDraftPath && window.studio.openPath(pkg.releaseDraftPath)} disabled={!pkg?.releaseDraftPath}>
              Open Draft JSON
            </button>
            <button className="btn ghost" onClick={() => pkg?.releaseManifestPath && window.studio.openPath(pkg.releaseManifestPath)} disabled={!pkg?.releaseManifestPath}>
              Open echo-release.json
            </button>
            <button className="btn ghost" onClick={() => pkg?.releaseIndexHandoffPath && window.studio.openPath(pkg.releaseIndexHandoffPath)} disabled={!pkg?.releaseIndexHandoffPath}>
              Open Handoff
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Repository Publishing</h3>
          {authStatus && (
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <span className={`badge ${authStatus.ghCliAuthenticated ? 'ready' : 'local'}`}>{authStatus.ghCliAuthenticated ? 'GitHub CLI Ready' : 'GitHub CLI Offline'}</span>
              <span className={`badge ${authStatus.githubAppConfigured ? 'ready' : 'local'}`}>{authStatus.githubAppConfigured ? 'GitHub App Configured' : 'GitHub App Not Configured'}</span>
              <span className={`badge ${authStatus.githubAppBrokerConfigured ? 'ready' : 'local'}`}>{authStatus.githubAppBrokerConfigured ? 'App Broker Configured' : 'App Broker Offline'}</span>
              <span className={`badge ${authStatus.githubAppSessionReady ? 'ready' : 'local'}`}>{authStatus.githubAppSessionReady ? 'App Session Ready' : 'App Session Needed'}</span>
            </div>
          )}
          {authStatus?.message && (
            <p className="dim" style={{ fontSize: 12 }}>
              {authStatus.message}
            </p>
          )}
          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">
              <span>Owner</span>
              <input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </label>
            <label className="field">
              <span>Repository</span>
              <input value={repo} onChange={(event) => setRepo(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Release tag</span>
            <input value={tag} onChange={(event) => setTag(event.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
            Create as GitHub draft
          </label>
          <div className="btn-row" style={{ marginTop: 12 }}>
            {authStatus?.githubAppConfigured && (
              <button className="btn" onClick={startAppLogin} disabled={busy}>
                Start App Login
              </button>
            )}
            <button className="btn" onClick={connectRepo} disabled={busy || !owner.trim() || !repo.trim()}>
              Connect Repo
            </button>
            <button className="btn primary" onClick={createDraft} disabled={busy || !publishReady}>
              Create Draft
            </button>
            {releaseUrl && (
              <button className="btn ghost" onClick={() => window.studio.openExternal(releaseUrl)}>
                Open GitHub Release
              </button>
            )}
          </div>
        </div>
      </div>

      {pkg && (
        <div className="grid cols-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <h3>Prepared Files</h3>
            <div className="list-row">
              <span className="badge ready">Package</span>
              <span className="mono" style={{ flex: 1, wordBreak: 'break-all' }}>{fileName(pkg.zipPath)}</span>
              <span className="dim" style={{ fontSize: 11 }}>{formatBytes(pkg.bytes)}</span>
            </div>
            {handoffAssets.length > 0 ? (
              handoffAssets.map((asset) => (
                <div className="list-row" key={`${asset.role}-${asset.name}`} style={{ padding: '8px 10px' }}>
                  <span className={`badge ${asset.role === 'artifact' ? 'ready' : 'local'}`}>{asset.role}</span>
                  <span className="mono" style={{ flex: 1, wordBreak: 'break-all' }}>{asset.name}</span>
                  <span className="dim" style={{ fontSize: 11 }}>{formatBytes(asset.bytes)}</span>
                </div>
              ))
            ) : (
              pkg.assetPaths.map((assetPath) => (
                <div className="list-row" key={assetPath} style={{ padding: '8px 10px' }}>
                  <span className="badge ready">artifact</span>
                  <span className="mono" style={{ flex: 1, wordBreak: 'break-all' }}>{fileName(assetPath)}</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>Release Index Handoff</h3>
            {pkg.releaseIndexHandoff ? (
              <>
                <div className="btn-row" style={{ marginBottom: 10 }}>
                  <span className="badge">{pkg.releaseIndexHandoff.targetRepository}</span>
                  <span className="badge">{pkg.releaseIndexHandoff.targetCollection}</span>
                  <span className="badge">{pkg.releaseIndexHandoff.entryFileName}</span>
                  <span className="badge">{pkg.releaseIndexHandoff.attestation.subjects.length} attestation subject(s)</span>
                </div>
                <div className="code" style={{ maxHeight: 320 }}>
                  {JSON.stringify(pkg.releaseIndexHandoff, null, 2)}
                </div>
              </>
            ) : (
              <p className="dim" style={{ margin: 0 }}>
                No Release Index handoff was generated.
              </p>
            )}
          </div>
        </div>
      )}

      {pkg?.releaseIndexPreview !== undefined && (
        <div className="card">
          <h3>Release Index Preview</h3>
          <div className="code" style={{ maxHeight: 360 }}>
            {JSON.stringify(pkg.releaseIndexPreview, null, 2) ?? 'null'}
          </div>
        </div>
      )}
    </Page>
  )
}
