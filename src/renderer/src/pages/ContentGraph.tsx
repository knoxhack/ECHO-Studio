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
        e.push({ from: m.id, to: rw.item })
      }
      if (m.indexEntry) e.push({ from: m.id, to: m.indexEntry })
      if (m.holomapMarker) e.push({ from: m.id, to: m.holomapMarker })
    }
    for (const r of recipes) {
      for (const inp of r.inputs) {
        add(inp.item, inp.item.split(':').pop() || inp.item, 2, '/items')
        e.push({ from: inp.item, to: r.id })
      }
      add(r.output.item, r.output.item.split(':').pop() || r.output.item, 2, '/items')
      e.push({ from: r.id, to: r.output.item })
      if (r.indexEntry) e.push({ from: r.output.item, to: r.indexEntry })
    }
    for (const lt of loot) {
      for (const entry of lt.entries) {
        add(entry.item, entry.item.split(':').pop() || entry.item, 2, '/items')
        e.push({ from: lt.id, to: entry.item })
      }
    }
    for (const d of dialogues) {
      for (const line of d.lines) {
        if (line.next) e.push({ from: d.id, to: line.next })
      }
    }
    for (const l of layers) for (const mk of l.markers) if (mk.linkedMission) e.push({ from: mk.linkedMission, to: mk.id })

    setNodes(n)
    setEdges(e.filter((edge) => n.find((x) => x.id === edge.from) && n.find((x) => x.id === edge.to)))
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
                    {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </Page>
  )
}
