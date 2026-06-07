import { useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { TARGET_LABELS } from '@shared/constants'
import type { AddonProject } from '@shared/types'

const LEVELS = [
  ['Local Only', 'Visible only to you on this machine.', 'local'],
  ['Community Published', 'Installable by users who allow community addons.', 'community'],
  ['Verified Addon', 'Reviewed and trusted by the ECHO team.', 'verified'],
  ['Featured', 'Promoted by the ECHO team.', 'ready'],
  ['Blocked', 'Hidden or install-blocked for safety reasons.', 'fixes']
] as const

export default function CommunityCatalog(): JSX.Element {
  const { workspaceDir } = useWorkspace()
  const [projects, setProjects] = useState<AddonProject[]>([])
  const [query, setQuery] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('all')

  useEffect(() => {
    if (!workspaceDir) return
    window.studio.listProjects(workspaceDir).then((res) => {
      if (res.ok && res.data) setProjects(res.data)
    })
  }, [workspaceDir])

  const filtered = useMemo(() => {
    let list = projects
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((p) =>
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.namespace.toLowerCase().includes(q) ||
        (p.manifest.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
      )
    }
    if (filterLevel !== 'all') {
      list = list.filter((p) => p.manifest.trust.level === filterLevel)
    }
    return list
  }, [projects, query, filterLevel])

  return (
    <Page title="Community Catalog" subtitle="Browse addons from your workspace and the community catalog.">
      <div className="section-title">Catalog Levels</div>
      <div className="grid cols-3">
        {LEVELS.map(([name, desc, cls]) => (
          <div className="card" key={name}>
            <span className={`badge ${cls}`}>{name}</span>
            <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              {desc}
            </p>
          </div>
        ))}
      </div>

      <div className="section-title">Browse Catalog ({filtered.length})</div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <input
          placeholder="Search by name, namespace, or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} style={{ width: 140 }}>
          <option value="all">All levels</option>
          <option value="community">Community</option>
          <option value="verified">Verified</option>
          <option value="featured">Featured</option>
          <option value="local">Local</option>
        </select>
      </div>

      {filtered.length === 0 && <div className="dim" style={{ padding: 20 }}>No addons match your search.</div>}
      {filtered.map((p) => (
        <div className="list-row" key={p.path}>
          <div style={{ flex: 1 }}>
            <b>{p.manifest.name}</b> <span className="dim">by {p.manifest.namespace}</span>
            <div className="faint" style={{ fontSize: 12 }}>
              Target: {p.manifest.target.experiences.map((e) => TARGET_LABELS[e]).join(', ')} · v{p.manifest.version}
            </div>
            {p.manifest.tags && (
              <div className="btn-row" style={{ marginTop: 4 }}>
                {p.manifest.tags.map((t) => (
                  <span key={t} className="badge" style={{ fontSize: 10 }}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <span className={`badge ${p.manifest.trust.level}`}>{p.manifest.trust.level}</span>
          <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>{p.publishStatus}</span>
        </div>
      ))}
    </Page>
  )
}
