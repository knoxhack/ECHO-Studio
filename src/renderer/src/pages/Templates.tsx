import { useState } from 'react'
import { Page } from '../components/Page'
import { CloneDialog } from '../components/CloneDialog'
import { templatesByCategory } from '@shared/templateLibrary'
import type { TemplateDef } from '@shared/templateLibrary'

export default function Templates(): JSX.Element {
  const groups = templatesByCategory()
  const [clone, setClone] = useState<TemplateDef | null>(null)

  return (
    <Page
      title="Templates"
      subtitle="Real starting points. Each generates a full project scaffold with example content, validation config and docs."
    >
      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat}>
          <div className="section-title">{cat} Templates</div>
          <div className="grid cols-3">
            {items.map((t) => (
              <div className="tile" key={t.id} onClick={() => setClone(t)}>
                <h4>{t.name}</h4>
                <p>{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      {clone && <CloneDialog template={clone} onClose={() => setClone(null)} />}
    </Page>
  )
}
