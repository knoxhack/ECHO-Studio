import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { ContentRecord, ContentType, Dialogue, HoloMapLayer, IndexEntry, LootTable, Mission, Recipe } from '@shared/content/schemas'

interface GNode {
  id: string
  label: string
  col: number
  row: number
  color: string
  route: string
}
interface GEdge {
  from: string
  to: string
  relation: string
  route: string
}
interface GIssue {
  message: string
  route: string
}

const COLS = ['Missions', 'Recipes', 'Items', 'Loot', 'Index', 'Markers', 'Dialogue']
const COL_COLOR = ['#38b6ff', '#2ee6c8', '#fbbf24', '#fb923c', '#a78bfa', '#f87171', '#34d399']
const COL_W = 200
const ROW_H = 64
const NODE_W = 150
const NODE_H = 38

export default function ContentGraph(): JSX.Element {
  const { activeProject } = useWorkspace()
  const nav = useNavigate()
  const [nodes, setNodes] = useState<GNode[]>([])
  const [edges, setEdges] = useState<GEdge[]>([])
  const [issues, setIssues] = useState<GIssue[]>([])

  const build = useCallback(async () => {
    if (!activeProject) return
    const res = await window.studio.listAllContent(activeProject.path)
    if (!res.ok || !res.data) return
    const data = res.data as Record<ContentType, ContentRecord[]>
    const n: GNode[] = []
    const e: GEdge[] = []
    const rows = [0, 0, 0, 0, 0, 0, 0]
    const add = (id: string, label: string, col: number, route: string): void => {
      if (n.find((x) => x.id === id)) return
      n.push({ id, label, col, row: rows[col]++, color: COL_COLOR[col], route })
    }
    const link = (from: string | undefined, to: string | undefined, relation: string, route: string): void => {
      if (!from || !to) return
      e.push({ from, to, relation, route })
    }

    const missions = (data.mission ?? []).map((r) => r.data as Mission)
    const recipes = (data.recipe ?? []).map((r) => r.data as Recipe)
    const items = (data.item ?? []).map((r) => r.data as { id: string; name?: string })
    const loot = (data.loot ?? []).map((r) => r.data as LootTable)
    const index = (data.index ?? []).map((r) => r.data as IndexEntry)
    const layers = (data.holomap ?? []).map((r) => r.data as HoloMapLayer)
    const dialogues = (data.dialogue ?? []).map((r) => r.data as Dialogue)

    for (const m of missions) add(m.id, m.title, 0, '/missions')
    for (const r of recipes) add(r.id, r.id.split(':').pop() || r.id, 1, '/recipes')
    for (const it of items) add(it.id, it.name || it.id, 2, '/items')
    for (const lt of loot) add(lt.id, lt.id.split(':').pop() || lt.id, 3, '/loot')
    for (const ix of index) add(ix.id, ix.title, 4, '/index')
    for (const l of layers) for (const mk of l.markers) add(mk.id, mk.title, 5, '/holomap')
    for (const d of dialogues) add(d.id, d.id.split(':').pop() || d.id, 6, '/dialogue')

    // Edges
    for (const m of missions) {
      for (const rw of m.rewards) {
        add(rw.item, rw.item.split(':').pop() || rw.item, 2, '/items')
        link(m.id, rw.item, 'reward item', '/items')
      }
      link(m.id, m.unlockAfter, 'prerequisite mission', '/missions')
      link(m.id, m.indexEntry, 'Index entry', '/index')
      link(m.id, m.holomapMarker, 'HoloMap marker', '/holomap')
    }
    for (const r of recipes) {
      for (const inp of r.inputs) {
        add(inp.item, inp.item.split(':').pop() || inp.item, 2, '/items')
        link(inp.item, r.id, 'recipe input', '/recipes')
      }
      add(r.output.item, r.output.item.split(':').pop() || r.output.item, 2, '/items')
      link(r.id, r.output.item, 'recipe output', '/items')
      link(r.output.item, r.indexEntry, 'Index entry', '/index')
    }
    for (const lt of loot) {
      for (const entry of lt.entries) {
        add(entry.item, entry.item.split(':').pop() || entry.item, 2, '/items')
        link(lt.id, entry.item, 'loot entry', '/items')
      }
    }
    for (const d of dialogues) {
      for (const line of d.lines) {
        link(d.id, line.next, 'dialogue next link', '/dialogue')
      }
    }
    for (const l of layers) {
      for (const mk of l.markers) {
        link(mk.linkedMission, mk.id, 'linked mission marker', '/missions')
        link(mk.id, mk.linkedIndex, 'linked Index entry', '/index')
      }
    }
    for (const ix of index) {
      for (const recipeId of ix.relatedRecipes ?? []) link(ix.id, recipeId, 'related recipe', '/recipes')
      for (const missionId of ix.relatedMissions ?? []) link(ix.id, missionId, 'related mission', '/missions')
      for (const markerId of ix.relatedMarkers ?? []) link(ix.id, markerId, 'related marker', '/holomap')
    }

    const nodeIds = new Set(n.map((node) => node.id))
    const missingSources = e
      .filter((edge) => !nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge) => ({
        message: `${edge.to} references missing ${edge.relation}: ${edge.from}`,
        route: edge.route
      }))
    const missingTargets = e
      .filter((edge) => nodeIds.has(edge.from) && !nodeIds.has(edge.to))
      .map((edge) => ({
        message: `${edge.from} references missing ${edge.relation}: ${edge.to}`,
        route: edge.route
      }))
    setNodes(n)
    setEdges(e.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)))
    setIssues([...missingSources, ...missingTargets])
  }, [activeProject])

  useEffect(() => {
    build()
  }, [build])

  if (!activeProject)
    return (
      <Page title="Content Graph" subtitle="Visualise how your content connects.">
        <NoProject />
      </Page>
    )

  const pos = (node: GNode): { x: number; y: number } => ({
    x: node.col * COL_W + 20,
    y: node.row * ROW_H + 40
  })
  const center = (node: GNode): { x: number; y: number } => {
    const p = pos(node)
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 }
  }
  const maxRows = Math.max(1, ...nodes.map((n) => n.row + 1))
  const height = maxRows * ROW_H + 80
  const width = COLS.length * COL_W + 40

  const nodeById = (id: string): GNode | undefined => nodes.find((n) => n.id === id)

  return (
    <Page
      title="Content Graph"
      subtitle="Visualise how missions, recipes, items, loot, index, markers and dialogue connect. Click a node to open its editor."
      actions={<button className="btn" onClick={build}>Refresh</button>}
    >
      <ActiveBar />
      {nodes.length === 0 ? (
        <div className="empty">No content yet. Create missions, recipes or items to see the graph.</div>
      ) : (
        <>
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <Metric label="Nodes" value={String(nodes.length)} tone="var(--accent)" />
            <Metric label="Links" value={String(edges.length)} tone="var(--good)" />
            <Metric label="Missing Refs" value={String(issues.length)} tone={issues.length ? 'var(--warn)' : 'var(--good)'} />
          </div>
          {issues.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Missing References</h3>
              {issues.slice(0, 8).map((issue) => (
                <div className="issue WARNING" key={issue.message}>
                  <span className="lvl">WARNING</span>
                  {issue.message}
                  <button className="btn ghost" style={{ marginLeft: 10 }} onClick={() => nav(issue.route)}>
                    Open Editor
                  </button>
                </div>
              ))}
              {issues.length > 8 && <p className="dim" style={{ fontSize: 12 }}>{issues.length - 8} more missing reference(s).</p>}
            </div>
          )}
          <div className="card" style={{ overflow: 'auto' }}>
            <svg width={width} height={height} style={{ minWidth: width }}>
              {COLS.map((c, i) => (
                <text key={c} x={i * COL_W + 20} y={20} fill={COL_COLOR[i]} fontSize={12} fontWeight={700}>
                  {c}
                </text>
              ))}
              {edges.map((edge, i) => {
                const a = nodeById(edge.from)
                const b = nodeById(edge.to)
                if (!a || !b) return null
                const c1 = center(a)
                const c2 = center(b)
                const x1 = c1.x + NODE_W / 2
                const x2 = c2.x - NODE_W / 2
                const mx = (x1 + x2) / 2
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${c1.y} C ${mx} ${c1.y}, ${mx} ${c2.y}, ${x2} ${c2.y}`}
                    stroke="#2a3d52"
                    strokeWidth={1.5}
                    fill="none"
                  />
                )
              })}
              {nodes.map((node) => {
                const p = pos(node)
                return (
                  <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => nav(node.route)}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={6}
                      fill="#111a27"
                      stroke={node.color}
                      strokeWidth={1.2}
                    />
                    <text x={p.x + 10} y={p.y + 23} fill="#d6e2f0" fontSize={11}>
                      {node.label.length > 18 ? node.label.slice(0, 17) + '...' : node.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </>
      )}
    </Page>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ color: tone }}>{value}</div>
    </div>
  )
}
