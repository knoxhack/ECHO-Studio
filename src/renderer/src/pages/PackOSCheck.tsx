import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { autoFixManifest } from '@shared/validation'
import { editorLabelForProjectFile, editorRouteForProjectFile } from '@shared/content/routes'
import type { CodexTask } from '@shared/codexTasks'
import type { DevWorkspaceState } from '@shared/devWorkspace'
import type { PackOSReport } from '@shared/types'

function diffDetail(missing: string[], extra: string[], ready: string): string {
  const parts = [
    missing.length ? `Missing: ${missing.join(', ')}.` : '',
    extra.length ? `Extra: ${extra.join(', ')}.` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : ready
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

export default function PackOSCheck(): JSX.Element {
  const { activeProject, refresh, toast } = useWorkspace()
  const nav = useNavigate()
  const [report, setReport] = useState<PackOSReport | null>(null)
  const [devWorkspace, setDevWorkspace] = useState<DevWorkspaceState | null>(null)
  const [fixing, setFixing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [codexTasks, setCodexTasks] = useState<CodexTask[]>([])

  const run = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    const [res, tasks, workspace] = await Promise.all([
      window.studio.fullCheck(activeProject.path),
      window.studio.listCodexTasks(activeProject.path),
      window.studio.inspectDevWorkspace(activeProject.path)
    ])
    setLoading(false)
    if (res.ok && res.data) setReport(res.data)
    if (tasks.ok && tasks.data) setCodexTasks(tasks.data)
    setDevWorkspace(workspace.ok && workspace.data ? workspace.data : null)
  }, [activeProject])

  useEffect(() => {
    run()
  }, [run])

  if (!activeProject)
    return (
      <Page title="Validation" subtitle="PackOS, modules, content references, assets, runtime compatibility, and release readiness.">
        <NoProject />
      </Page>
    )
  if (!report)
    return (
      <Page title="Validation">
        <div className="empty">{loading ? 'Running checks...' : 'Preparing...'}</div>
      </Page>
    )

  const applyManifestFixes = async (): Promise<void> => {
    setFixing(true)
    const manifestRes = await window.studio.readManifest(activeProject.path)
    if (manifestRes.ok && manifestRes.data) {
      const catalogRes = await window.studio.listEchoModules(activeProject.path)
      const fixed = autoFixManifest(manifestRes.data, catalogRes.ok && catalogRes.data ? catalogRes.data.catalog : undefined)
      await window.studio.writeManifest(activeProject.path, fixed)
      await refresh()
    }
    setFixing(false)
    toast('Applied manifest fixes')
    run()
  }

  const hs = report.healthScore
  const reviewableCodexTasks = codexTasks.filter((task) => task.lane !== 'rejected')
  const manifestFixAvailable = Boolean(codexTasks.some((task) => task.id === 'manifest:packos-autofix' && task.lane !== 'rejected'))
  const aiFixableCount = report.issues.filter((issue) => issue.aiFixable).length
  const workspaceSetUp = Boolean(devWorkspace?.lastSetupAt)
  const workspaceReady = Boolean(devWorkspace && (devWorkspace.mode === 'visual' || (devWorkspace.gradleReady && devWorkspace.hasGradleWrapper)))
  const toolchainReady = Boolean(devWorkspace && (devWorkspace.mode === 'visual' || (devWorkspace.toolchain.javaMeetsRequirement && devWorkspace.toolchain.gradleAvailable)))
  const moduleReady = Boolean(devWorkspace?.moduleLock.upToDate && devWorkspace.moduleWorkspace.upToDate && devWorkspace.modulePlan.missingRequired.length === 0 && devWorkspace.modulePlan.unknown.length === 0)
  const previewReady = Boolean(devWorkspace?.runtimeLaunchers.ready)
  const hasReleaseManifest = Boolean(devWorkspace?.artifacts.some((artifact) => artifact.name === 'echo-release.json'))
  const hasChecksums = Boolean(devWorkspace?.artifacts.some((artifact) => artifact.name === 'checksums.sha256'))
  const artifactReady = Boolean(devWorkspace?.artifacts.length && hasReleaseManifest && hasChecksums)
  const openIssueFile = (file: string): void => {
    nav(editorRouteForProjectFile(file))
  }
  return (
    <Page
      title="Validation"
      subtitle="Full project validation: contracts, modules, content references, assets, runtime, local dev setup, and release readiness."
      actions={
        <>
          <button className="btn" disabled={loading} onClick={run}>
            {loading ? 'Checking...' : 'Re-run Check'}
          </button>
          <button
            className="btn primary"
            disabled={fixing || !manifestFixAvailable}
            onClick={applyManifestFixes}
          >
            {fixing ? 'Applying...' : 'Apply Manifest Fixes'}
          </button>
          <button className="btn" disabled={reviewableCodexTasks.length === 0} onClick={() => nav('/codex')}>
            Review Codex Fixes
          </button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Compatibility Score</h3>
          <div
            className="score-ring"
            style={{ color: report.compatibilityScore >= 70 ? 'var(--good)' : 'var(--bad)' }}
          >
            {report.compatibilityScore}%
          </div>
          <div className="bar" style={{ marginTop: 8 }}>
            <span style={{ width: `${report.compatibilityScore}%` }} />
          </div>
        </div>
        <div className="card">
          <h3>Publishing Status</h3>
          <div
            className="metric"
            style={{ fontSize: 18, color: hs.publishing === 'Ready' ? 'var(--good)' : 'var(--warn)' }}
          >
            {hs.publishing}
          </div>
          <div className="sub">
            Blockers {report.counts.BLOCKER} - Errors {report.counts.ERROR}
          </div>
        </div>
        <div className="card">
          <h3>Permissions</h3>
          <div
            className="metric"
            style={{
              fontSize: 18,
              color:
                hs.permissions === 'Safe'
                  ? 'var(--good)'
                  : hs.permissions === 'Risky'
                    ? 'var(--warn)'
                    : 'var(--bad)'
            }}
          >
            {hs.permissions}
          </div>
        </div>
        <div className="card">
          <h3>Native Readiness</h3>
          <div className="metric" style={{ fontSize: 22 }}>
            {hs.nativeReadiness}%
          </div>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 14 }}>
        {(['BLOCKER', 'ERROR', 'WARNING', 'SUGGESTION'] as const).map((lvl) => (
          <span key={lvl} className="badge">
            {lvl}: {report.counts[lvl]}
          </span>
        ))}
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Local Loop Readiness</h3>
          <StepRow
            done={moduleReady}
            label="ECHO Modules"
            detail={
              devWorkspace
                ? moduleReady
                  ? `${devWorkspace.modulePlan.closure.length} module(s) resolved with current lock and source map.`
                  : [
                      devWorkspace.modulePlan.missingRequired.length ? `Missing closure: ${devWorkspace.modulePlan.missingRequired.map((mod) => mod.name).join(', ')}.` : '',
                      devWorkspace.modulePlan.unknown.length ? `Unknown: ${devWorkspace.modulePlan.unknown.join(', ')}.` : '',
                      !devWorkspace.moduleLock.upToDate ? diffDetail(devWorkspace.moduleLock.missingFromLock, devWorkspace.moduleLock.extraInLock, 'Module lock is current.') : '',
                      !devWorkspace.moduleWorkspace.upToDate ? diffDetail(devWorkspace.moduleWorkspace.missingFromMap, devWorkspace.moduleWorkspace.extraInMap, 'Module workspace map is current.') : ''
                    ].filter(Boolean).join(' ')
                : 'Inspecting module closure.'
            }
          />
          <StepRow
            done={workspaceReady}
            label="Dev Workspace"
            detail={
              devWorkspace
                ? workspaceSetUp
                  ? devWorkspace.mode === 'visual'
                    ? 'Visual workspace is selected; code setup is optional.'
                    : devWorkspace.gradleReady
                      ? devWorkspace.hasGradleWrapper
                        ? 'Pinned Gradle launcher and generated project files are available.'
                        : 'Gradle project files exist, but the pinned launcher is missing.'
                      : 'Run Dev Workspace setup to generate Gradle project files.'
                  : 'Run setup from Modules or Dev Workspace to create the local build surface.'
                : 'Inspecting workspace setup.'
            }
          />
          <StepRow
            done={toolchainReady}
            label="Toolchain"
            detail={
              devWorkspace
                ? devWorkspace.mode === 'visual'
                  ? 'Visual mode does not require Java or Gradle tasks.'
                  : devWorkspace.toolchain.issues.length > 0
                    ? devWorkspace.toolchain.issues.join(' ')
                    : `Java ${devWorkspace.toolchain.javaVersion ?? devWorkspace.toolchain.requiredJavaVersion} and ${devWorkspace.toolchain.gradleCommand} are ready.`
                : 'Inspecting Java and Gradle availability.'
            }
          />
          <StepRow
            done={previewReady}
            label="Preview Launchers"
            detail={
              devWorkspace
                ? previewReady
                  ? 'Selected runtime preview launchers are configured.'
                  : 'Set missing ECHO Native or Standalone executable paths in Settings, then run setup.'
                : 'Inspecting preview launcher configuration.'
            }
          />
          <StepRow
            done={artifactReady}
            label="Release Artifacts"
            detail={
              devWorkspace
                ? artifactReady
                  ? `${devWorkspace.artifacts.length} artifact/sidecar file(s), including echo-release.json and checksums.sha256.`
                  : devWorkspace.artifacts.length > 0
                    ? 'Built artifacts exist, but release sidecars are missing.'
                    : 'Run Release Builder to prepare local packages and Release Index sidecars.'
                : 'Inspecting local artifact outputs.'
            }
          />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => nav('/modules')}>Modules</button>
            <button className="btn ghost" onClick={() => nav('/dev-workspace')}>Dev Workspace</button>
            <button className="btn ghost" onClick={() => nav('/preview')}>Preview</button>
            <button className="btn ghost" onClick={() => nav('/release')}>Release Builder</button>
          </div>
        </div>

        <div className="card">
          <h3>Artifact Health</h3>
          <div className="score-ring" style={{ color: hs.assets >= 80 ? 'var(--good)' : hs.assets >= 60 ? 'var(--warn)' : 'var(--bad)' }}>
            {hs.assets}%
          </div>
          <div className="bar" style={{ marginTop: 8 }}>
            <span style={{ width: `${hs.assets}%` }} />
          </div>
          <p className="dim" style={{ fontSize: 13 }}>
            PackOS treats local release artifacts as ready only when runtime packages and Release Index sidecars are present.
          </p>
          {devWorkspace?.artifacts.length ? (
            <div className="btn-row">
              {devWorkspace.artifacts.slice(0, 8).map((artifact) => (
                <span className={`badge ${artifact.kind === 'checksum' || artifact.kind === 'manifest' ? 'ready' : 'local'}`} key={artifact.path}>
                  {artifact.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="dim" style={{ fontSize: 12 }}>No local artifacts found yet.</p>
          )}
        </div>
      </div>

      {aiFixableCount > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Reviewable Fixes</h3>
          <p className="dim" style={{ marginTop: 0 }}>
            {reviewableCodexTasks.length > 0
              ? `${reviewableCodexTasks.length} Codex task(s) are available for ${aiFixableCount} AI-fixable validation issue(s). Review diffs before applying content or workspace changes.`
              : `${aiFixableCount} issue(s) are marked AI-fixable. Re-run checks or open Codex Tasks to refresh repair proposals.`}
          </p>
          <div className="btn-row">
            <button className="btn primary" disabled={reviewableCodexTasks.length === 0} onClick={() => nav('/codex')}>
              Review Codex Tasks
            </button>
            {manifestFixAvailable && (
              <button className="btn ghost" disabled={fixing} onClick={applyManifestFixes}>
                Apply Manifest-Only Fix
              </button>
            )}
          </div>
        </div>
      )}

      {report.issues.length === 0 ? (
        <div className="card">
          <p className="dim" style={{ margin: 0 }}>
            No issues found. This addon passes PackOS validation.
          </p>
        </div>
      ) : (
        report.issues.map((issue, i) => (
          <div className={`issue ${issue.level}`} key={i}>
            <div>
              <span className="lvl">{issue.level}</span>
              <span className="dim" style={{ fontSize: 11 }}>
                {issue.category}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>{issue.message}</div>
            {issue.fix && <div className="fix">Fix: {issue.fix}</div>}
            <div className="btn-row" style={{ marginTop: 8 }}>
              {issue.aiFixable && (
                <button className="btn ghost" onClick={() => nav('/codex')}>
                  Review Codex Fix
                </button>
              )}
              {issue.file && (
                <button className="btn ghost" onClick={() => openIssueFile(issue.file!)}>
                  Open {editorLabelForProjectFile(issue.file)}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </Page>
  )
}
