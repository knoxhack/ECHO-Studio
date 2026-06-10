import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { GitHubPublishingStatus, PackageResult, ReleaseIndexHandoffAsset } from '@shared/publishing'
import type { DevWorkspaceState } from '@shared/devWorkspace'
import type { EchoModuleRecord } from '@shared/moduleCatalog'
import type { PackOSReport } from '@shared/types'

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

function diffDetail(missing: string[], extra: string[], ready: string): string {
  const parts = [
    missing.length ? `Missing: ${missing.join(', ')}.` : '',
    extra.length ? `Extra: ${extra.join(', ')}.` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : ready
}

function moduleBadgeClass(mod: EchoModuleRecord): string {
  if (mod.blocked || mod.trustLevel === 'blocked') return 'fixes'
  if (mod.trustLevel === 'official' || mod.trustLevel === 'trusted') return 'ready'
  if (mod.trustLevel === 'sandboxed' || mod.status === 'internal' || mod.status === 'deprecated') return 'local'
  return 'badge'
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
  const nav = useNavigate()
  const [owner, setOwner] = useState('knoxhack')
  const [repo, setRepo] = useState('')
  const [tag, setTag] = useState('v0.1.0')
  const [draft, setDraft] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [pkg, setPkg] = useState<PackageResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [releaseUrl, setReleaseUrl] = useState('')
  const [authStatus, setAuthStatus] = useState<GitHubPublishingStatus | null>(null)
  const [workspace, setWorkspace] = useState<DevWorkspaceState | null>(null)
  const [preflight, setPreflight] = useState<PackOSReport | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)

  const refreshAuth = useCallback(async () => {
    const result = await window.studio.getGitHubPublishingStatus()
    if (result.ok && result.data) setAuthStatus(result.data)
  }, [])

  const refreshReadiness = useCallback(async () => {
    if (!activeProject) {
      setWorkspace(null)
      setPreflight(null)
      return
    }
    setReadinessLoading(true)
    const [workspaceResult, checkResult] = await Promise.all([
      window.studio.inspectDevWorkspace(activeProject.path),
      window.studio.fullCheck(activeProject.path)
    ])
    setReadinessLoading(false)
    setWorkspace(workspaceResult.ok && workspaceResult.data ? workspaceResult.data : null)
    setPreflight(checkResult.ok && checkResult.data ? checkResult.data : null)
  }, [activeProject])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    void refreshReadiness()
  }, [refreshReadiness])

  useEffect(() => {
    if (!activeProject) {
      setPkg(null)
      setStatus(null)
      setReleaseUrl('')
      setWorkspace(null)
      setPreflight(null)
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
  const readinessReport = pkg?.report ?? preflight
  const moduleClosure = workspace?.modulePlan.closure ?? []
  const blockedModules = moduleClosure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked')
  const moduleReady = Boolean(
    workspace &&
    workspace.moduleLock.upToDate &&
    workspace.moduleWorkspace.upToDate &&
    workspace.modulePlan.missingRequired.length === 0 &&
    workspace.modulePlan.unknown.length === 0 &&
    blockedModules.length === 0
  )

  const packageProject = async (): Promise<void> => {
    if (!activeProject) {
      setStatus('Select a project first.')
      return
    }
    setBusy(true)
    setReleaseUrl('')
    try {
      const result = await window.studio.packageAddon(activeProject.path)
      if (!result.ok || !result.data) throw new Error(result.error ?? 'Package build failed.')
      const next = result.data
      setPkg(next)
      setPreflight(next.report)
      setStatus(`Prepared ${fileName(next.zipPath)}.`)
      if (next.releaseIndexHandoff?.sourceRepo) {
        const [nextOwner, nextRepo] = next.releaseIndexHandoff.sourceRepo.split('/')
        if (nextOwner) setOwner(nextOwner)
        if (nextRepo) setRepo(nextRepo)
      }
      if (next.releaseIndexHandoff?.releaseTag) setTag(next.releaseIndexHandoff.releaseTag)
      const workspaceResult = await window.studio.inspectDevWorkspace(activeProject.path)
      if (workspaceResult.ok && workspaceResult.data) setWorkspace(workspaceResult.data)
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
    if (!publishReady) {
      setStatus(`Cannot create a GitHub draft yet. ${publishBlockers[0] ?? 'Review the draft requirements.'}`)
      return
    }
    if (
      !pkg?.releaseDraftPath ||
      !pkg.checksumsPath ||
      !pkg.packageManifestPath ||
      !pkg.releaseManifestPath ||
      !pkg.releaseIndexHandoffPath ||
      !pkg.releaseIndexSubmissionPath ||
      !pkg.releaseIndexHandoff?.attestation.subjects.length
    ) {
      setStatus('Prepare local release assets with Release Index handoff, submission notes, and attestation metadata before creating a GitHub draft.')
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
      <Page title="Release Builder" subtitle="Build local release assets, checksums, echo-release.json, Release Index handoff, and submission notes.">
        <NoProject />
      </Page>
    )
  }

  const sdkReady = pkg?.sdkValidation.ok ?? false
  const packosReady = readinessReport?.publishingReady ?? false
  const releaseSidecarsReady = Boolean(
    pkg?.checksumsPath &&
    pkg.packageManifestPath &&
    pkg.releaseManifestPath &&
    pkg.releaseIndexHandoffPath &&
    pkg.releaseIndexSubmissionPath &&
    pkg.releaseDraftPath
  )
  const handoffReady = Boolean(
    pkg?.releaseIndexHandoff?.schemaVersion === 'echo.release.index.handoff.v1' &&
    pkg.releaseIndexHandoff.targetRepository === 'knoxhack/ECHO-Release-Index' &&
    pkg.releaseIndexHandoff.targetCollection === 'addons' &&
    pkg.releaseIndexHandoff.entryFileName
  )
  const attestationSubjectCount = pkg?.releaseIndexHandoff?.attestation.subjects.length ?? 0
  const attestationReady = Boolean(
    pkg?.releaseIndexHandoff?.attestation.provider === 'github-artifact-attestations' &&
    pkg.releaseIndexHandoff.attestation.requireDigestMatch &&
    attestationSubjectCount > 0
  )
  const selectedRepository = `${owner.trim()}/${repo.trim()}`
  const handoffTargetReady = Boolean(
    pkg?.releaseIndexHandoff?.sourceRepo &&
    pkg.releaseIndexHandoff.releaseTag &&
    pkg.releaseIndexHandoff.sourceRepo === selectedRepository &&
    pkg.releaseIndexHandoff.releaseTag === tag.trim()
  )
  const authReady = Boolean(authStatus?.githubAppSessionReady || authStatus?.ghCliAuthenticated)
  const publishRequirements = [
    {
      key: 'sdk',
      ready: sdkReady,
      label: 'Package contract',
      detail: pkg ? (sdkReady ? 'Package manifest is valid.' : `${pkg.sdkValidation.issues.length} contract issue(s) need review.`) : 'Run Prepare Assets to validate the package manifest.'
    },
    {
      key: 'packos',
      ready: packosReady,
      label: 'PackOS',
      detail: readinessReport ? `Blockers ${readinessReport.counts.BLOCKER} - Errors ${readinessReport.counts.ERROR}.` : 'Run project validation or Prepare Assets.'
    },
    {
      key: 'modules',
      ready: moduleReady,
      label: 'ECHO Modules',
      detail: workspace
        ? moduleReady
          ? 'Module lock, workspace map, closure, and trust state are current.'
          : 'Refresh Dev Workspace until module lock, workspace map, dependencies, and trust state are current.'
        : 'Refresh readiness to inspect module closure.'
    },
    {
      key: 'sidecars',
      ready: releaseSidecarsReady,
      label: 'Release sidecars',
      detail: releaseSidecarsReady ? 'All package sidecars and draft metadata were generated.' : 'Run Prepare Assets to write checksums, package manifest, release manifest, handoff, submission notes, and draft JSON.'
    },
    {
      key: 'handoff',
      ready: handoffReady,
      label: 'Release Index handoff',
      detail: handoffReady ? `${pkg?.releaseIndexHandoff?.entryFileName} targets ${pkg?.releaseIndexHandoff?.targetCollection}.` : 'Generate a valid ECHO Release Index handoff.'
    },
    {
      key: 'attestation',
      ready: attestationReady,
      label: 'Attestation subjects',
      detail: attestationReady ? `${attestationSubjectCount} checksum subject(s) are ready for GitHub attestation verification.` : 'Generate digest subjects for release artifacts.'
    },
    {
      key: 'repository',
      ready: Boolean(owner.trim() && repo.trim() && tag.trim()),
      label: 'Repository target',
      detail: owner.trim() && repo.trim() && tag.trim() ? `${selectedRepository} at ${tag}.` : 'Enter owner, repository, and release tag.'
    },
    {
      key: 'handoff-target',
      ready: handoffTargetReady,
      label: 'Handoff target match',
      detail: pkg?.releaseIndexHandoff
        ? handoffTargetReady
          ? `Matches ${pkg.releaseIndexHandoff.sourceRepo}@${pkg.releaseIndexHandoff.releaseTag}.`
          : `Generated handoff targets ${pkg.releaseIndexHandoff.sourceRepo}@${pkg.releaseIndexHandoff.releaseTag}; selected ${selectedRepository}@${tag.trim() || '(missing)'}.`
        : 'Prepare Assets to generate the handoff source repository and release tag.'
    },
    {
      key: 'auth',
      ready: authReady,
      label: 'GitHub auth',
      detail: authReady ? `Publishing will use ${providerLabel(authStatus)}.` : authStatus?.message ?? 'Refresh auth or connect GitHub publishing.'
    }
  ]
  const publishBlockers = publishRequirements
    .filter((requirement) => !requirement.ready)
    .map((requirement) => `${requirement.label}: ${requirement.detail}`)
  const publishReady = Boolean(
    sdkReady &&
    packosReady &&
    moduleReady &&
    releaseSidecarsReady &&
    handoffReady &&
    attestationReady &&
    owner.trim() &&
    repo.trim() &&
    tag.trim() &&
    handoffTargetReady &&
    authReady
  )
  const draftDisabledReason = busy
    ? 'A release action is already running.'
    : publishReady
      ? 'Ready to create a GitHub draft.'
      : publishBlockers[0] ?? 'Review draft requirements.'

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
        <Metric label="Package Contract" value={sdkReady ? 'Ready' : pkg ? 'Issues' : 'Pending'} tone={sdkReady ? 'var(--good)' : pkg ? 'var(--bad)' : 'var(--warn)'} />
        <Metric label="PackOS" value={readinessReport ? `${readinessReport.compatibilityScore}%` : readinessLoading ? 'Checking' : 'Pending'} tone={packosReady ? 'var(--good)' : readinessReport ? 'var(--warn)' : 'var(--text-faint)'} />
        <Metric label="ECHO Modules" value={moduleReady ? 'Current' : workspace ? 'Needs Sync' : 'Checking'} tone={moduleReady ? 'var(--good)' : 'var(--warn)'} />
        <Metric label="Publish Auth" value={providerLabel(authStatus)} tone={authStatus?.activeProvider === 'none' ? 'var(--warn)' : 'var(--good)'} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Local Readiness</h3>
          <StepRow
            done={Boolean(workspace && (workspace.mode === 'visual' || (workspace.gradleReady && workspace.hasGradleWrapper)))}
            label="Developer workspace"
            detail={
              workspace
                ? workspace.mode === 'visual'
                  ? 'Visual mode is selected; code generation is optional.'
                  : workspace.gradleReady
                    ? workspace.hasGradleWrapper
                      ? 'Pinned Gradle launcher and project files are available.'
                      : 'Gradle project files exist, but the pinned launcher is missing.'
                    : 'Run Dev Workspace setup before building local runtime artifacts.'
                : 'Inspecting workspace setup.'
            }
          />
          <StepRow
            done={Boolean(workspace && (workspace.mode === 'visual' || (workspace.toolchain.javaMeetsRequirement && workspace.toolchain.gradleAvailable)))}
            label="Local toolchain"
            detail={
              workspace
                ? workspace.mode === 'visual'
                  ? 'Visual mode does not require Java or Gradle tasks.'
                  : workspace.toolchain.issues.length > 0
                    ? workspace.toolchain.issues.join(' ')
                    : `Java ${workspace.toolchain.javaVersion ?? workspace.toolchain.requiredJavaVersion} and ${workspace.toolchain.gradleCommand} are ready.`
                : 'Inspecting Java and Gradle availability.'
            }
          />
          <StepRow
            done={Boolean(workspace?.moduleLock.upToDate)}
            label="Module lock"
            detail={
              workspace
                ? diffDetail(
                    workspace.moduleLock.missingFromLock,
                    workspace.moduleLock.extraInLock,
                    `${workspace.moduleLock.lockedModuleIds.length} locked module(s).`
                  )
                : 'Inspecting resolved ECHO module closure.'
            }
          />
          <StepRow
            done={Boolean(workspace?.moduleWorkspace.upToDate)}
            label="Module workspace map"
            detail={
              workspace
                ? workspace.moduleWorkspace.upToDate
                  ? `${workspace.moduleWorkspace.localModuleCount}/${workspace.moduleWorkspace.moduleCount} module(s) linked to local ECHO-Modules source; ${workspace.moduleWorkspace.gradleBuildCount ?? 0} Gradle build(s) available.`
                  : diffDetail(
                      workspace.moduleWorkspace.missingFromMap,
                      workspace.moduleWorkspace.extraInMap,
                      'Module workspace map is current.'
                    )
                : 'Inspecting local ECHO-Modules source links.'
            }
          />
          <StepRow
            done={Boolean(workspace?.runtimeLaunchers.ready)}
            label="Runtime launchers"
            detail={
              workspace
                ? workspace.runtimeLaunchers.ready
                  ? 'Configured launch paths match the selected runtime targets.'
                  : 'Set missing ECHO Native or Standalone executable paths, then run setup again.'
                : 'Inspecting preview launcher configuration.'
            }
          />
          <StepRow
            done={packosReady}
            label="Validation preflight"
            detail={
              readinessReport
                ? `Blockers ${readinessReport.counts.BLOCKER} - Errors ${readinessReport.counts.ERROR} - Warnings ${readinessReport.counts.WARNING}`
                : 'Run validation before packaging.'
            }
          />

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={readinessLoading} onClick={refreshReadiness}>
              {readinessLoading ? 'Checking...' : 'Refresh Readiness'}
            </button>
            <button className="btn ghost" onClick={() => nav('/dev-workspace')}>Dev Workspace</button>
            <button className="btn ghost" onClick={() => nav('/modules')}>Modules</button>
            <button className="btn ghost" onClick={() => nav('/validation')}>Validation</button>
          </div>
        </div>

        <div className="card">
          <h3>ECHO Module Closure</h3>
          {workspace?.moduleCatalog.indexPath && (
            <div className="mono dim" style={{ fontSize: 11, marginBottom: 10, wordBreak: 'break-all' }}>
              {workspace.moduleCatalog.indexPath}
            </div>
          )}
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <span className={`badge ${workspace?.moduleCatalog.localAvailable ? 'ready' : 'local'}`}>
              {workspace?.moduleCatalog.localAvailable ? 'Local ECHO-Modules' : 'Built-in Catalog'}
            </span>
            <span className={`badge ${moduleReady ? 'ready' : 'local'}`}>
              {moduleClosure.length} module(s)
            </span>
            {workspace?.moduleWorkspace.localModuleCount !== undefined && (
              <span className="badge">
                {workspace.moduleWorkspace.localModuleCount} local source link(s)
              </span>
            )}
            {workspace?.moduleWorkspace.gradleBuildCount !== undefined && (
              <span className={`badge ${workspace.moduleWorkspace.gradleBuildCount > 0 ? 'ready' : 'local'}`}>
                {workspace.moduleWorkspace.gradleBuildCount} Gradle build(s)
              </span>
            )}
          </div>

          {workspace?.moduleCatalog.warnings.length ? (
            <div className="issue WARNING" style={{ marginBottom: 12 }}>
              <span className="lvl">WARNING</span>
              {workspace.moduleCatalog.warnings.join(' ')}
            </div>
          ) : null}
          {blockedModules.length > 0 && (
            <div className="issue BLOCKER" style={{ marginBottom: 12 }}>
              <span className="lvl">BLOCKER</span>
              Blocked modules cannot be included in public release assets.
              <div className="fix">{blockedModules.map((mod) => mod.name).join(', ')}</div>
            </div>
          )}
          {workspace?.modulePlan.missingRequired.length ? (
            <div className="issue WARNING" style={{ marginBottom: 12 }}>
              <span className="lvl">WARNING</span>
              Missing required modules: {workspace.modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.
            </div>
          ) : null}
          {workspace?.modulePlan.unknown.length ? (
            <div className="issue WARNING" style={{ marginBottom: 12 }}>
              <span className="lvl">WARNING</span>
              Unknown module dependencies: {workspace.modulePlan.unknown.join(', ')}.
            </div>
          ) : null}

          <div className="btn-row">
            {moduleClosure.map((mod) => (
              <span className={`badge ${moduleBadgeClass(mod)}`} key={mod.id}>
                {mod.name} - {mod.trustLevel ?? mod.status}
              </span>
            ))}
            {moduleClosure.length === 0 && <span className="dim">No ECHO modules declared.</span>}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Local Release Pipeline</h3>
          <StepRow done={sdkReady} label="Addon package contract" detail={pkg ? (sdkReady ? 'Package manifest passes contract validation.' : `${pkg.sdkValidation.issues.length} issue(s) found.`) : 'Run Prepare Assets to validate echo-addon-package.json.'} />
          <StepRow done={packosReady} label="PackOS project validation" detail={readinessReport ? `Blockers ${readinessReport.counts.BLOCKER} - Errors ${readinessReport.counts.ERROR}` : 'Run project validation as part of the package build.'} />
          <StepRow done={releaseSidecarsReady} label="Release sidecars" detail="Write checksums.sha256, echo-addon-package.json, echo-release.json, release-index-handoff.json, release-index-submission.md, and github-release-draft.json." />
          <StepRow
            done={handoffReady}
            label="Release Index handoff"
            detail={
              pkg?.releaseIndexHandoff
                ? `${pkg.releaseIndexHandoff.targetRepository} / ${pkg.releaseIndexHandoff.targetCollection} / ${pkg.releaseIndexHandoff.entryFileName}`
                : 'Generate handoff metadata for Release Index ingestion.'
            }
          />
          <StepRow
            done={attestationReady}
            label="Artifact attestation plan"
            detail={attestationSubjectCount ? `${attestationSubjectCount} artifact subject(s) require GitHub digest verification.` : 'Generate attestation subjects for each release artifact.'}
          />
          <StepRow done={assetCount > 0} label="Release artifacts" detail={assetCount ? `${assetCount} generated artifact and sidecar file(s).` : 'Prepare assets to generate runtime packages and sidecars.'} />
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
            <button className="btn ghost" onClick={() => pkg?.releaseIndexSubmissionPath && window.studio.openPath(pkg.releaseIndexSubmissionPath)} disabled={!pkg?.releaseIndexSubmissionPath}>
              Open Submission Notes
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
          <div className="section-title">Draft Requirements</div>
          {publishRequirements.map((requirement) => (
            <StepRow
              key={requirement.key}
              done={requirement.ready}
              label={requirement.label}
              detail={requirement.detail}
            />
          ))}
          {!publishReady && (
            <div className="issue WARNING" style={{ marginTop: 12 }}>
              <span className="lvl">WAITING</span>
              {publishBlockers[0] ?? 'Review draft requirements before publishing.'}
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 12 }}>
            {authStatus?.githubAppConfigured && (
              <button className="btn" onClick={startAppLogin} disabled={busy}>
                Start App Login
              </button>
            )}
            <button className="btn" onClick={connectRepo} disabled={busy || !owner.trim() || !repo.trim()}>
              Connect Repo
            </button>
            <button className="btn primary" onClick={createDraft} disabled={busy || !publishReady} title={draftDisabledReason}>
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
