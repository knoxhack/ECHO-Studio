import { useCallback, useEffect, useState } from 'react'
import GraphEditor, { type GraphEdge, type GraphIssue, type GraphNode } from '../components/GraphEditor'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { ContentRecord, ContentType, Dialogue, HoloMapLayer, IndexEntry, LootTable, Mission, Recipe } from '@shared/content/schemas'

const COL_COLOR = ['#38b6ff', '#2ee6c8', '#fbbf24', '#fb923c', '#a78bfa', '#f87171', '#34d399']

export default function ContentGraph(): JSX.Element {
  const { activeProject } = useWorkspace()
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [issues, setIssues] = useState<GraphIssue[]>([])

  const build = useCallback(async () => {
    if (!activeProject) return
    const res = await window.studio.listAllContent(activeProject.path)
    if (!res.ok || !res.data) return
    const data = res.data as Record<ContentType, ContentRecord[]>
    const n: GraphNode[] = []
    const e: GraphEdge[] = []
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
        route: edge.route,
      }))
    const missingTargets = e
      .filter((edge) => nodeIds.has(edge.from) && !nodeIds.has(edge.to))
      .map((edge) => ({
        message: `${edge.from} references missing ${edge.relation}: ${edge.to}`,
        route: edge.route,
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

  const hytaleReady = issues.length === 0 && nodes.length > 0

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
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Hytale Export Readiness</h3>
            {hytaleReady ? (
              <div className="issue SUGGESTION">
                <span className="lvl">READY</span>
                All authored content references resolve within this project. Generate a release build to produce the canonical `.ECHO Content Graph` and Hytale export plan.
              </div>
            ) : (
              <>
                <div className="issue WARNING">
                  <span className="lvl">BLOCKED</span>
                  {issues.length} unresolved reference(s) prevent a clean export plan. Resolve missing references before publishing.
                </div>
                <p className="dim" style={{ marginTop: 8, fontSize: 12 }}>
                  This view checks authored content inside ECHO Studio only. The platform `.ECHO Content Graph` artifact is generated by ECHO-Modules and validated by ECHO-SDK schemas.
                </p>
              </>
            )}
          </div>
          <GraphEditor nodes={nodes} edges={edges} issues={issues} />
        </>
      )}
    </Page>
  )
}
