import { useState } from 'react'
import { Page } from '../components/Page'
import { CloneDialog } from '../components/CloneDialog'
import { templateById } from '@shared/templateLibrary'
import type { TemplateDef } from '@shared/templateLibrary'

// Curated, clonable example projects (each maps to a real template).
const EXAMPLE_IDS = [
  'example_mission',
  'example_recipe',
  'mission_board_ui',
  'holomap_layer_pack',
  'ashfall_expansion'
]

export default function Examples(): JSX.Element {
  const [clone, setClone] = useState<TemplateDef | null>(null)
  const examples = EXAMPLE_IDS.map(templateById).filter(Boolean) as TemplateDef[]

  return (
    <Page
      title="Examples"
      subtitle="Real, working example addons you can clone and learn from."
    >
      <div className="grid cols-2">
        {examples.map((e) => (
          <div className="card hover" key={e.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ flex: 1, margin: 0 }}>{e.name}</h3>
              <span className="badge community">{e.category}</span>
            </div>
            <p className="dim" style={{ fontSize: 13 }}>{e.description}</p>
            <button className="btn ghost" onClick={() => setClone(e)}>
              Use this example
            </button>
          </div>
        ))}
      </div>
      {clone && <CloneDialog template={clone} onClose={() => setClone(null)} />}
    </Page>
  )
}
