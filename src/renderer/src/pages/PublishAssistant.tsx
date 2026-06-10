import { useEffect, useState } from 'react'
import type { GitHubPublishingStatus, PackageResult } from '@shared/publishing'
import { useWorkspace } from '../state/WorkspaceContext'

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

  useEffect(() => {
    void window.studio.getGitHubPublishingStatus().then((result) => {
      if (result.ok && result.data) setAuthStatus(result.data)
    })
  }, [])

  const packageProject = async () => {
    if (!activeProject) {
      setStatus('Select an addon project first.')
      return
    }
    setBusy(true)
    try {
      const result = await window.studio.packageAddon(activeProject.path)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'Package build failed.')
      setPkg(result.data)
      setStatus(`Prepared ${result.data.zipPath}`)
      toast('Release assets prepared')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Package build failed.')
    } finally {
      setBusy(false)
    }
  }

  const connectRepo = async () => {
    setBusy(true)
    try {
      const result = await window.studio.connectGitHubRepo(owner, repo)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'Repository connection failed.')
      setStatus(result.data.message)
      if (result.data.exists) toast(`Connected ${owner}/${repo}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Repository connection failed.')
    } finally {
      setBusy(false)
    }
  }

  const startAppLogin = async () => {
    setBusy(true)
    try {
      const result = await window.studio.startGitHubAppLogin()
      if (!result.ok || !result.data) throw new Error(result.error ?? 'GitHub App login failed.')
      const url = result.data.authorizeUrl || result.data.installUrl
      if (url) await window.studio.openExternal(url)
      setStatus(result.data.message)
      const refreshed = await window.studio.getGitHubPublishingStatus()
      if (refreshed.ok && refreshed.data) setAuthStatus(refreshed.data)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GitHub App login failed.')
    } finally {
      setBusy(false)
    }
  }

  const createDraft = async () => {
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'GitHub release draft failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Release Builder</h1>
      <p className="page-subtitle">
        Build local release assets, generate checksums and echo-release.json, then optionally connect GitHub for a draft release.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Repository Publishing</h2>
        {authStatus && (
          <div className="flex gap-2" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${authStatus.ghCliAuthenticated ? 'ready' : 'local'}`}>
              {authStatus.ghCliAuthenticated ? 'GitHub CLI Ready' : 'GitHub CLI Offline'}
            </span>
            <span className={`badge ${authStatus.githubAppConfigured ? 'ready' : 'local'}`}>
              {authStatus.githubAppConfigured ? 'GitHub App Configured' : 'GitHub App Not Configured'}
            </span>
            <span className={`badge ${authStatus.githubAppBrokerConfigured ? 'ready' : 'local'}`}>
              {authStatus.githubAppBrokerConfigured ? 'App Broker Configured' : 'App Broker Offline'}
            </span>
            <span className={`badge ${authStatus.githubAppSessionReady ? 'ready' : 'local'}`}>
              {authStatus.githubAppSessionReady ? 'App Session Ready' : 'App Session Needed'}
            </span>
            {authStatus.githubAppConfigured && (
              <button className="btn secondary" onClick={startAppLogin} disabled={busy}>
                Start App Login
              </button>
            )}
          </div>
        )}
        <div className="grid gap-2" style={{ marginTop: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 480 }}>
          <input className="input" placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          <input className="input" placeholder="Repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <input className="input" placeholder="Tag (e.g. v0.1.0)" value={tag} onChange={(e) => setTag(e.target.value)} />
          <label className="badge">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} style={{ marginRight: 6 }} />
            Draft
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Local Release Pipeline</h2>
        <div className="grid gap-2" style={{ marginTop: 8 }}>
          <div className="list-item">
            <span className={`badge ${pkg?.sdkValidation.ok ? 'ready' : 'local'}`}>1</span>
            Validate SDK package contract.
          </div>
          <div className="list-item">
            <span className={`badge ${pkg?.report.publishingReady ? 'ready' : 'local'}`}>2</span>
            Run PackOS project validation.
          </div>
          <div className="list-item">
            <span className={`badge ${pkg?.checksumsPath ? 'ready' : 'local'}`}>3</span>
            Write artifacts, checksums, package manifest, release manifest, and draft JSON.
          </div>
          <div className="list-item">
            <span className={`badge ${authStatus?.activeProvider !== 'none' ? 'ready' : 'local'}`}>4</span>
            Optional: connect repository with GitHub CLI or a GitHub App broker session.
          </div>
          <div className="list-item">
            <span className={`badge ${releaseUrl ? 'ready' : 'local'}`}>5</span>
            Optional: create GitHub Release draft and upload prepared assets.
          </div>
        </div>
        {status && (
          <div className="badge" style={{ marginTop: 12, display: 'inline-block' }}>
            {status}
          </div>
        )}
        <div className="flex gap-2" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={packageProject} disabled={busy || !activeProject}>
            Prepare Assets
          </button>
          <button className="btn secondary" onClick={connectRepo} disabled={busy || !owner.trim() || !repo.trim()}>
            Connect Repo
          </button>
          <button className="btn primary" onClick={createDraft} disabled={busy || !pkg?.releaseDraftPath || !owner.trim() || !repo.trim()}>
            Create Draft
          </button>
          <button className="btn secondary" onClick={() => pkg?.releaseDraftPath && window.studio.openPath(pkg.releaseDraftPath)} disabled={!pkg?.releaseDraftPath}>
            Open Draft JSON
          </button>
          <button className="btn secondary" onClick={() => pkg?.releaseManifestPath && window.studio.openPath(pkg.releaseManifestPath)} disabled={!pkg?.releaseManifestPath}>
            Open echo-release.json
          </button>
          <button className="btn secondary" onClick={() => pkg?.checksumsPath && window.studio.openPath(pkg.checksumsPath)} disabled={!pkg?.checksumsPath}>
            Open Checksums
          </button>
        </div>
        {pkg && (
          <div className="grid gap-2" style={{ marginTop: 12 }}>
            <div className="badge">Package: {pkg.zipPath}</div>
            <div className="badge">SDK Contract: {pkg.sdkValidation.ok ? 'ready' : `${pkg.sdkValidation.issues.length} issue(s)`}</div>
            <div className="badge">Built Assets: {pkg.assetPaths.length}</div>
            <div className="badge">Checksums: {pkg.checksumsPath ?? 'not written'}</div>
            <div className="badge">Package Manifest: {pkg.packageManifestPath ?? 'not written'}</div>
            <div className="badge">Release Manifest: {pkg.releaseManifestPath ?? 'not written'}</div>
            <div className="badge">Draft JSON: {pkg.releaseDraftPath ?? 'not written'}</div>
          </div>
        )}
        {pkg?.releaseIndexPreview !== undefined && (
          <div className="card" style={{ marginTop: 12, background: 'var(--bg-2)' }}>
            <h3>Release Index Preview</h3>
            <p className="dim" style={{ fontSize: 12 }}>
              This is the exact local entry Studio writes to echo-release.json before GitHub publishing or Release Index ingestion.
            </p>
            <div className="code" style={{ maxHeight: 280 }}>
              {JSON.stringify(pkg.releaseIndexPreview, null, 2) ?? 'null'}
            </div>
          </div>
        )}
        {releaseUrl && (
          <div style={{ marginTop: 12 }}>
            <a className="btn ghost" href={releaseUrl} target="_blank" rel="noreferrer">
              Open GitHub Release
            </a>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Docs Links</h2>
        <ul className="list" style={{ marginTop: 8 }}>
          <li className="list-item">
            <a href="https://echo-platform.dev/docs/publishing" target="_blank" rel="noreferrer">
              Publishing Guide
            </a>
          </li>
          <li className="list-item">
            <a href="https://echo-platform.dev/docs/packos" target="_blank" rel="noreferrer">
              PackOS Validation Rules
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
