import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { resolveProjectModulePlan } from '@shared/moduleCatalog'
import type { AddonManifest, PackOSReport } from '@shared/types'

interface StudioTask {
  id: string
  title: string
  lane: 'suggested' | 'waiting' | 'ready'
  reason: string
  route: string
}

export default function CodexTasks(): JSX.Element {
  const { activeProject } = useWorkspace()
  const nav = useNavigate()
  const [manifest, setManifest] = useState<AddonManifest | null>(null)
  const [report, setReport] = useState<PackOSReport | null>(null)

  useEffect(() => {
    if (!activeProject) {
      setManifest(null)
      setReport(null)
      return
    }
    window.studio.readManifest(activeProject.path).then((result) => {
      if (result.ok && result.data) setManifest(result.data)
    })
    window.studio.fullCheck(activeProject.path).then((result) => {
      if (result.ok && result.data) setReport(result.data)
    })
  }, [activeProject])

  const tasks = useMemo<StudioTask[]>(() => {
    if (!manifest) return []
    const out: StudioTask[] = []
    const modulePlan = resolveProjectModulePlan(manifest)
    if (modulePlan.missingRequired.length > 0) {
      out.push({
        id: 'module-closure',
        title: 'Repair module dependency closure',
        lane: 'suggested',
        reason: `${modulePlan.missingRequired.length} required module(s) are missing from the project manifest.`,
        route: '/modules'
      })
    }
    if (report && (report.counts.BLOCKER > 0 || report.counts.ERROR > 0)) {
      out.push({
        id: 'packos-repair',
        title: 'Fix PackOS blockers',
        lane: 'waiting',
        reason: `${report.counts.BLOCKER} blocker(s) and ${report.counts.ERROR} error(s) need review before release.`,
        route: '/validation'
      })
    }
    if (!manifest.runtime.supports.includes('standalone')) {
      out.push({
        id: 'standalone-target',
        title: 'Evaluate standalone runtime target',
        lane: 'suggested',
        reason: 'Standalone packaging is optional, but Studio can prepare the project for runtime preview and release assets.',
        route: '/dev-workspace'
      })
    }
    out.push({
      id: 'release-prep',
      title: 'Prepare local release package',
      lane: 'ready',
      reason: 'Generate local artifacts, checksums, and echo-release.json before connecting GitHub.',
      route: '/release'
    })
    return out
  }, [manifest, report])

  if (!activeProject) {
    return (
      <Page title="Codex" subtitle="Task-based build assistance with review and approval gates.">
        <NoProject />
      </Page>
    )
  }

  return (
    <Page
      title="Codex"
      subtitle="A task queue for module repairs, validation fixes, generated content, release prep, and reviewable changes."
      actions={<button className="btn" onClick={() => nav('/ai')}>Open Legacy Chat</button>}
    >
      <ActiveBar />
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Lane title="Suggested" count={tasks.filter((task) => task.lane === 'suggested').length} />
        <Lane title="Waiting Review" count={tasks.filter((task) => task.lane === 'waiting').length} />
        <Lane title="Ready" count={tasks.filter((task) => task.lane === 'ready').length} />
      </div>

      <div className="grid cols-3">
        {(['suggested', 'waiting', 'ready'] as const).map((lane) => (
          <div className="card" key={lane}>
            <h3>{lane === 'suggested' ? 'Suggested Tasks' : lane === 'waiting' ? 'Waiting for Review' : 'Ready Tasks'}</h3>
            {tasks.filter((task) => task.lane === lane).map((task) => (
              <button key={task.id} className="tile" style={{ display: 'block', textAlign: 'left', marginBottom: 10, width: '100%' }} onClick={() => nav(task.route)}>
                <h4>{task.title}</h4>
                <p>{task.reason}</p>
              </button>
            ))}
            {tasks.filter((task) => task.lane === lane).length === 0 && (
              <p className="dim" style={{ fontSize: 12 }}>No tasks in this lane.</p>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Approval Model</h3>
        <p className="dim" style={{ fontSize: 13 }}>
          Codex work should land as proposed tasks with diffs, affected files, validation output, and approve, revise, or reject actions. Chat remains available as an advanced helper, not the main workflow.
        </p>
      </div>
    </Page>
  )
}

function Lane({ title, count }: { title: string; count: number }): JSX.Element {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="metric">{count}</div>
    </div>
  )
}
