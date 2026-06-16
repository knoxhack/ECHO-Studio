import { useNavigate } from 'react-router-dom'

export interface GraphNode {
  id: string
  label: string
  col: number
  row: number
  color: string
  route: string
}

export interface GraphEdge {
  from: string
  to: string
  relation: string
  route: string
}

export interface GraphIssue {
  message: string
  route: string
}

interface GraphEditorProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  issues: GraphIssue[]
  onRefresh?: () => void
}

const COLS = ['Missions', 'Recipes', 'Items', 'Loot', 'Index', 'Markers', 'Dialogue']
const COL_W = 200
const ROW_H = 64
const NODE_W = 150
const NODE_H = 38

function Metric({ label, value, tone }: { label: string; value: string; tone: string }): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ color: tone }}>{value}</div>
    </div>
  )
}

export default function GraphEditor({ nodes, edges, issues, onRefresh }: GraphEditorProps): JSX.Element {
  const nav = useNavigate()
  const pos = (node: GraphNode): { x: number; y: number } => ({
    x: node.col * COL_W + 20,
    y: node.row * ROW_H + 40,
  })
  const center = (node: GraphNode): { x: number; y: number } => {
    const p = pos(node)
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 }
  }
  const maxRows = Math.max(1, ...nodes.map((n) => n.row + 1))
  const height = maxRows * ROW_H + 80
  const width = COLS.length * COL_W + 40
  const nodeById = (id: string): GraphNode | undefined => nodes.find((n) => n.id === id)

  return (
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
            <text key={c} x={i * COL_W + 20} y={20} fill={['#38b6ff', '#2ee6c8', '#fbbf24', '#fb923c', '#a78bfa', '#f87171', '#34d399'][i]} fontSize={12} fontWeight={700}>
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

      {onRefresh && (
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={onRefresh}>Refresh</button>
        </div>
      )}
    </>
  )
}
