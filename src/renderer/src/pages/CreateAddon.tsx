import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { buildManifest } from '@shared/templates'
import { resolveProjectModulePlan } from '@shared/moduleCatalog'
import {
  ADDON_TYPE_LABELS,
  RESERVED_NAMESPACE,
  RUNTIME_LABELS,
  TARGET_LABELS
} from '@shared/constants'
import type { AddonType, CreateAddonOptions, Runtime, TargetExperience } from '@shared/types'

const STEPS = ['Type', 'Target', 'Identity', 'Runtime', 'Modules', 'Options', 'Generate']

export default function CreateAddon(): JSX.Element {
  const { workspaceDir, refresh, setActiveProject, toast } = useWorkspace()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<AddonType>('mission_pack')
  const [target, setTarget] = useState<TargetExperience>('ashfall')
  const [namespace, setNamespace] = useState('teamnova')
  const [addonId, setAddonId] = useState('orbital_colonies')
  const [name, setName] = useState('Orbital Colonies')
  const [description, setDescription] = useState('')
  const [runtimes, setRuntimes] = useState<Runtime[]>(['neoforge', 'echo_native'])
  const [opts, setOpts] = useState({
    includeExample: true,
    includeHoloMap: true,
    includeIndex: true,
    includeRewards: true,
    includeLocalization: true,
    includePreviewProfile: true
  })

  const nsBlocked = namespace.trim().toLowerCase() === RESERVED_NAMESPACE
  const idValid = /^[a-z0-9_]+$/.test(addonId) && /^[a-z0-9_]+$/.test(namespace)
  const currentOptions = useMemo<CreateAddonOptions>(() => ({
    workspaceDir,
    type,
    target,
    namespace: namespace.trim(),
    addonId: addonId.trim(),
    name: name.trim() || addonId.trim() || 'Untitled Project',
    description: description.trim(),
    runtimes: runtimes.length ? runtimes : ['neoforge'],
    options: opts
  }), [addonId, description, name, namespace, opts, runtimes, target, type, workspaceDir])
  const modulePlan = useMemo(() => resolveProjectModulePlan(buildManifest(currentOptions)), [currentOptions])
  const moduleIssues = modulePlan.missingRequired.length + modulePlan.unknown.length + modulePlan.closure.filter((mod) => mod.blocked || mod.trustLevel === 'blocked').length

  const toggleRuntime = (r: Runtime): void =>
    setRuntimes((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))

  const generate = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    const res = await window.studio.createAddon(currentOptions)
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Failed to create project.')
      return
    }
    await refresh()
    if (res.data) setActiveProject(res.data)
    toast(`Created ${namespace}:${addonId}. Review modules next.`)
    nav('/modules')
  }

  const canNext =
    (step === 2 && idValid && !nsBlocked && name.trim().length > 0) ||
    (step === 3 && runtimes.length > 0) ||
    ![2, 3].includes(step)

  return (
    <Page
      title="Create"
      subtitle="A guided flow to scaffold an ECHO experience, addon, module, UI pack, mission pack, or local dev project."
    >
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
            <b>Step {i + 1}</b>
            {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="section-title">What do you want to build?</div>
          <div className="grid cols-3">
            {(Object.keys(ADDON_TYPE_LABELS) as AddonType[]).map((t) => (
              <div
                key={t}
                className={`tile ${type === t ? 'selected' : ''}`}
                onClick={() => setType(t)}
              >
                <h4>{ADDON_TYPE_LABELS[t]}</h4>
                <p>{typeBlurb(t)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="section-title">Choose target experience</div>
          <div className="grid cols-3">
            {(Object.keys(TARGET_LABELS) as TargetExperience[]).map((t) => (
              <div
                key={t}
                className={`tile ${target === t ? 'selected' : ''}`}
                onClick={() => setTarget(t)}
              >
                <h4>{TARGET_LABELS[t]}</h4>
                <p>{t === 'ashfall' ? 'Loads Ashfall-compatible templates.' : 'ECHO-compatible content.'}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <div className="card" style={{ maxWidth: 560 }}>
          <label className="field">
            <span>Creator namespace</span>
            <input value={namespace} onChange={(e) => setNamespace(e.target.value)} />
          </label>
          <label className="field">
            <span>Project ID</span>
            <input value={addonId} onChange={(e) => setAddonId(e.target.value)} />
          </label>
          <label className="field">
            <span>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Short description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="mono dim">
            Full ID: {namespace || 'namespace'}:{addonId || 'addon_id'}
          </div>
          {nsBlocked && (
            <div className="issue BLOCKER" style={{ marginTop: 12 }}>
              <span className="lvl">BLOCKER</span>
              The &ldquo;{RESERVED_NAMESPACE}&rdquo; namespace is reserved for ECHO Developers. Use your creator
              namespace instead.
            </div>
          )}
          {!idValid && (
            <div className="fix" style={{ color: 'var(--warn)', marginTop: 8 }}>
              Use lowercase letters, numbers, and underscores only.
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            Runtime support
          </div>
          {(Object.keys(RUNTIME_LABELS) as Runtime[]).map((r) => (
            <label className="checkbox" key={r}>
              <input
                type="checkbox"
                checked={runtimes.includes(r)}
                onChange={() => toggleRuntime(r)}
              />
              {RUNTIME_LABELS[r]}
            </label>
          ))}
          <p className="dim" style={{ fontSize: 12 }}>
            Recommended for new creators: NeoForge compatible + Native-ready structure where
            possible.
          </p>
        </div>
      )}

      {step === 4 && (
        <>
          <div className="section-title">Starter module plan</div>
          <div className="grid cols-2">
            <div className="card">
              <h3>Selected Modules</h3>
              <p className="dim" style={{ fontSize: 13 }}>
                These are written into the new project manifest from the type, target, and runtime choices.
              </p>
              <div className="btn-row">
                {modulePlan.enabled.map((mod) => (
                  <span className={`badge ${mod.blocked || mod.trustLevel === 'blocked' ? 'fixes' : 'ready'}`} key={mod.id}>
                    {mod.name}
                  </span>
                ))}
                {modulePlan.enabled.length === 0 && <span className="dim">No modules selected.</span>}
              </div>
            </div>
            <div className="card">
              <h3>Resolved Closure</h3>
              <p className="dim" style={{ fontSize: 13 }}>
                Studio also writes required transitive modules so validation, preview, and packaging start from a complete graph.
              </p>
              <div className="btn-row">
                {modulePlan.closure.map((mod) => (
                  <span className={`badge ${mod.status === 'stable' ? 'ready' : 'local'}`} key={mod.id}>
                    {mod.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {modulePlan.optionalAvailable.length > 0 && (
            <div className="issue INFO" style={{ marginTop: 12 }}>
              <span className="lvl">OPTIONAL</span>
              Optional modules available after creation: {modulePlan.optionalAvailable.map((mod) => mod.name).join(', ')}.
              <div className="fix">Open Modules after generation to add optional capabilities or remove modules before setup.</div>
            </div>
          )}
          {moduleIssues > 0 && (
            <div className="issue WARNING" style={{ marginTop: 12 }}>
              <span className="lvl">MODULES</span>
              This scaffold has {moduleIssues} module issue{moduleIssues === 1 ? '' : 's'} to review.
              <div className="fix">Open Modules after generation before running Dev Workspace setup.</div>
            </div>
          )}
        </>
      )}

      {step === 5 && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            Template options
          </div>
          {(
            [
              ['includeExample', 'Include example content'],
              ['includeHoloMap', 'Include HoloMap markers'],
              ['includeIndex', 'Include Index entries'],
              ['includeRewards', 'Include rewards'],
              ['includeLocalization', 'Include localization (en_us)'],
              ['includePreviewProfile', 'Include compatibility scan profile']
            ] as const
          ).map(([key, label]) => (
            <label className="checkbox" key={key}>
              <input
                type="checkbox"
                checked={opts[key]}
                onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {step === 6 && (
        <div className="card" style={{ maxWidth: 620 }}>
          <h3>Ready to generate</h3>
          <div className="code" style={{ marginBottom: 14 }}>
            {previewTree(namespace, addonId)}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>Type: {ADDON_TYPE_LABELS[type]}</div>
            <div>Target: {TARGET_LABELS[target]}</div>
            <div className="mono">ID: {namespace}:{addonId}</div>
            <div>Runtime: {runtimes.map((r) => RUNTIME_LABELS[r]).join(' + ')}</div>
            <div>Modules: {modulePlan.enabled.length} selected / {modulePlan.closure.length} in resolved closure</div>
            <div>Next: review Modules, then run Dev Workspace setup.</div>
          </div>
          {error && (
            <div className="issue ERROR" style={{ marginTop: 12 }}>
              <span className="lvl">ERROR</span>
              {error}
            </div>
          )}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 22 }}>
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={generate}>
            {busy ? 'Generating...' : 'Generate Project'}
          </button>
        )}
      </div>
    </Page>
  )
}

function typeBlurb(t: AddonType): string {
  const map: Partial<Record<AddonType, string>> = {
    gameplay_addon: 'Items, blocks, entities, recipes and more.',
    mission_pack: 'Missions, objectives, rewards, dialogue.',
    recipe_pack: 'Crafting, machine, recycling recipes.',
    ui_addon: 'Custom ScreenCore screens and themes.',
    holomap_layer: 'POI markers, routes, hazard zones.',
    index_pack: 'Item metadata, lore and guides.',
    world_pack: 'Regions, structures, loot tables.',
    theme_pack: 'ScreenCore theme tokens and skins.',
    asset_pack: 'Textures, sounds, icons, models.',
    server_module: 'Server-side rules and events.',
    community_experience: 'Bundle multiple addons into a pack.'
  }
  return map[t] || 'ECHO-compatible content.'
}

function previewTree(ns: string, id: string): string {
  return `${ns}_${id}/
+-- echo.mod.json
+-- META-INF/echo-addon-package.json
+-- packos.validation.json
+-- README.md
+-- CHANGELOG.md
+-- LICENSE
+-- assets/
+-- content/
+-- missions/
+-- recipes/
+-- holomap/
+-- index/
+-- lang/
+-- preview/
+-- docs/`
}
