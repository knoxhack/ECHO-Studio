import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'

const SURFACES = [
  { title: 'Items', route: '/items', description: 'Create items, blocks, icons, and gameplay-facing definitions.' },
  { title: 'Recipes', route: '/recipes', description: 'Build crafting and machine recipes with validation-friendly forms.' },
  { title: 'Loot', route: '/loot', description: 'Author loot tables, rewards, and weighted drops.' },
  { title: 'Dialogue', route: '/dialogue', description: 'Design conversations and link them into missions.' },
  { title: 'HoloMap', route: '/holomap', description: 'Place markers, routes, layers, and mission-linked points.' },
  { title: 'Content Graph', route: '/graph', description: 'Review how missions, items, recipes, map markers, and lore connect.' }
]

export default function Gameplay(): JSX.Element {
  const { activeProject } = useWorkspace()
  const nav = useNavigate()

  if (!activeProject) {
    return (
      <Page title="Gameplay" subtitle="Design gameplay systems without starting from raw files.">
        <NoProject />
      </Page>
    )
  }

  return (
    <Page
      title="Gameplay"
      subtitle="Visual builders for rules, items, recipes, loot, dialogue, map hooks, and content relationships."
    >
      <ActiveBar />
      <div className="grid cols-3">
        {SURFACES.map((surface) => (
          <button key={surface.route} className="tile" style={{ textAlign: 'left' }} onClick={() => nav(surface.route)}>
            <h4>{surface.title}</h4>
            <p>{surface.description}</p>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Gameplay Readiness</h3>
        <p className="dim" style={{ fontSize: 13 }}>
          Studio keeps gameplay authoring visual first. Script Studio, raw JSON, and file editing stay in Content until you need them.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => nav('/modules')}>Review Modules</button>
          <button className="btn" onClick={() => nav('/validation')}>Run Validation</button>
          <button className="btn primary" onClick={() => nav('/preview')}>Open Preview</button>
        </div>
      </div>
    </Page>
  )
}
