import { useState } from 'react'
import { Page } from '../components/Page'
import { CloneDialog } from '../components/CloneDialog'
import { useWorkspace } from '../state/WorkspaceContext'
import { buildManifest } from '@shared/templates'
import { resolveProjectModulePlan } from '@shared/moduleCatalog'
import { createOptionsFromTemplate, templatesByCategory } from '@shared/templateLibrary'
import type { TemplateDef } from '@shared/templateLibrary'

export default function Templates(): JSX.Element {
  const groups = templatesByCategory()
  const [clone, setClone] = useState<TemplateDef | null>(null)
  const { moduleCatalog, moduleCatalogResult } = useWorkspace()

  return (
    <Page
      title="Templates"
      subtitle="Real starting points. Each generates a full project scaffold with example content, validation config and docs."
    >
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <span className={`badge ${moduleCatalogResult?.source === 'local-index' ? 'ready' : 'local'}`}>
          {moduleCatalogResult?.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in module catalog'}
        </span>
        {moduleCatalogResult?.warnings.length ? (
          <span className="dim" style={{ fontSize: 12 }}>{moduleCatalogResult.warnings.join(' ')}</span>
        ) : null}
      </div>
      {Object.entries(groups).map(([cat, items]) => (
        <div key={cat}>
          <div className="section-title">{cat} Templates</div>
          <div className="grid cols-3">
            {items.map((t) => {
              const options = createOptionsFromTemplate(t, {
                workspaceDir: '',
                namespace: 'teamnova',
                addonId: t.id,
                name: t.name
              })
              const plan = resolveProjectModulePlan(buildManifest(options, moduleCatalog), moduleCatalog)
              return (
                <div className="tile" key={t.id} onClick={() => setClone(t)}>
                  <h4>{t.name}</h4>
                  <p>{t.description}</p>
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <span className="badge ready">{plan.targetModules.length} target</span>
                    <span className="badge local">{plan.requiredModules.length} required</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {clone && <CloneDialog template={clone} onClose={() => setClone(null)} />}
    </Page>
  )
}
