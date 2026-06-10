import { useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import { ECHO_MODULE_CATALOG, resolveProjectModulePlan, type EchoModuleRecord } from '@shared/moduleCatalog'

const CATEGORIES = [
  'Getting Started',
  'ECHO Modules',
  'Manifest Reference',
  'Package Contract',
  'Content Types',
  'MissionCore',
  'RecipeCore',
  'ScreenCore',
  'HoloMap',
  'Index',
  'Assets',
  'Validation',
  'Publishing',
  'Verification Program',
  'Best Practices',
  'Examples'
]

const SNIPPETS: Record<string, string> = {
  'Getting Started':
    'ECHO Studio lets you build on top of ECHO without starting from raw files.\n\n1. Create an experience, addon, module, or pack from a template.\n2. Choose ECHO Modules and set up the local dev workspace.\n3. Run preview clients and local builds.\n4. Run Validation.\n5. Package local release assets before GitHub publishing.',
  'ECHO Modules':
    'ECHO Modules provide the public contracts creators build against:\n- MissionCore (missions, objectives, rewards)\n- RecipeCore (crafting recipes, machine recipes)\n- ScreenCore (custom UI screens)\n- HoloMap (map layers and markers)\n- Index (lore entries)\n\nAll content must be namespaced to the creator.\nUse only documented module APIs and permissions.',
  'Manifest Reference':
    '{\n  "schemaVersion": 1,\n  "id": "teamnova:orbital_colonies",\n  "name": "Orbital Colonies",\n  "version": "0.3.0",\n  "namespace": "teamnova",\n  "description": "A brief description of what your project does.",\n  "developerType": "addon_developer",\n  "publisher": {\n    "id": "teamnova",\n    "name": "Team Nova",\n    "type": "team"\n  },\n  "projectClass": "community_addon",\n  "target": {\n    "experiences": ["ashfall"],\n    "modules": [\n      "echo:mission_core",\n      "echo:holomap",\n      "echo:index"\n    ]\n  },\n  "runtime": {\n    "supports": ["neoforge", "echo_native"],\n    "nativeReadiness": "partial",\n    "minimumEchoSdk": "1.4.0"\n  },\n  "permissions": ["mission.register", "holomap.layers", "index.entries", "addon_storage.write"],\n  "dependencies": {\n    "required": [\n      "echo:adapter_core",\n      "echo:core",\n      "echo:net_core",\n      "echo:mission_core",\n      "echo:holomap",\n      "echo:index"\n    ],\n    "optional": []\n  },\n  "trust": {\n    "level": "community",\n    "signed": false,\n    "verified": false\n  },\n  "support": {\n    "tier": "creator_supported",\n    "issues": "https://github.com/teamnova/issues"\n  },\n  "tags": ["echo", "addon", "gameplay"]\n}',
  'Package Contract':
    '{\n  "schemaVersion": "echo.addon.package.v1",\n  "id": "orbital_colonies",\n  "version": "0.3.0",\n  "publisher": {\n    "githubOwner": "teamnova",\n    "githubRepo": "orbital-colonies-addon"\n  },\n  "targets": ["native", "neoforge", "standalone"],\n  "dependencies": [\n    { "id": "echo:adapter_core", "kind": "module", "version": "*" },\n    { "id": "echo:core", "kind": "module", "version": "*" },\n    { "id": "echo:net_core", "kind": "module", "version": "*" },\n    { "id": "echo:mission_core", "kind": "module", "version": "*" },\n    { "id": "echo:holomap", "kind": "module", "version": "*" },\n    { "id": "echo:index", "kind": "module", "version": "*" }\n  ],\n  "artifacts": {\n    "native": "orbital_colonies-0.3.0.echo-addon",\n    "neoforge": "orbital_colonies-0.3.0-neoforge.jar",\n    "standalone": "orbital_colonies-0.3.0-standalone.jar",\n    "sources": "orbital_colonies-0.3.0-sources.jar"\n  }\n}',
  'Content Types':
    'ECHO Studio supports these content types:\n\n- mission    : Quests with objectives and rewards\n- recipe     : Crafting and machine recipes\n- screen     : Custom UI screens (ScreenCore)\n- holomap    : Map layers and markers\n- index      : Lore and data entries\n- item       : Custom items and blocks\n\nEach type has its own folder and JSON schema. Use visual builders first, then Content for raw files.',
  'MissionCore':
    '{\n  "id": "teamnova:find_beacon",\n  "title": "Find Signal Beacon",\n  "description": "Locate the missing signal beacon in the ruins.",\n  "objective": {\n    "type": "visit_location",\n    "target": "teamnova:beacon"\n  },\n  "completion": "reach_target",\n  "rewards": [\n    { "item": "teamnova:relay_frame", "count": 1 }\n  ],\n  "unlockAfter": "",\n  "holomapMarker": "teamnova:beacon_marker",\n  "indexEntry": "teamnova:beacon_lore"\n}',
  'RecipeCore':
    '{\n  "id": "teamnova:ash_alloy",\n  "type": "machine_recipe",\n  "name": "Ash Alloy",\n  "description": "Smelt rubble into ash alloy.",\n  "machine": "teamnova:grinder",\n  "inputs": [\n    { "item": "teamnova:rubble", "count": 4 }\n  ],\n  "output": {\n    "item": "teamnova:ash_alloy",\n    "count": 1\n  },\n  "time": 200,\n  "energy": 100,\n  "indexEntry": "teamnova:ash_alloy"\n}',
  'ScreenCore':
    '{\n  "id": "teamnova:mission_board",\n  "title": "Mission Board",\n  "type": "custom_ui",\n  "layout": "grid",\n  "components": [\n    {\n      "type": "list",\n      "source": "missions",\n      "filter": "active"\n    },\n    {\n      "type": "button",\n      "action": "accept_mission",\n      "label": "Accept"\n    }\n  ]\n}',
  'HoloMap':
    '{\n  "id": "teamnova:exploration_layer",\n  "title": "Exploration",\n  "type": "poi",\n  "markers": [\n    {\n      "id": "teamnova:ruin_marker",\n      "title": "Ancient Ruin",\n      "icon": "ruin",\n      "x": 64,\n      "z": 48,\n      "linkedMission": "teamnova:find_beacon"\n    }\n  ]\n}',
  'Index':
    '{\n  "id": "teamnova:beacon_lore",\n  "title": "Signal Beacon",\n  "category": "technology",\n  "content": "An emergency beacon used by colonists. Emits a low-frequency pulse detectable by HoloMap scanners.",\n  "tags": ["lore", "technology"]\n}',
  'Assets':
    'Assets are stored in the assets/ folder of your project.\n\nSupported formats:\n- PNG   : textures, icons, UI elements\n- JSON  : models, blockstates, language files\n- TTF   : custom fonts\n- OGG   : sound effects\n\nUse the Assets page to scan, import and export asset packs.\nAll assets are validated for correct format and size.',
  'Validation':
    'Validation is the core safety gate. It checks:\n\n1. Namespace safety - no reserved "echo:" namespace\n2. Permission safety - no blocked internal permissions\n3. Dependency completeness - required ECHO module closure present\n4. Version format - semantic versioning\n5. Content integrity - no broken references\n6. Publishing readiness - description, tags, support link\n\nRun Validation before every release. Use Codex Tasks for reviewable repair plans.',
  'Publishing':
    'To publish your project:\n\n1. Run Validation and resolve all BLOCKERs and ERRORs.\n2. Prepare release assets from Release.\n3. Review echo-addon-package.json, echo-release.json, checksums.sha256, release-index-handoff.json, and release-index-submission.md.\n4. Connect the GitHub App or GitHub CLI provider.\n5. Create a GitHub Release draft and upload the prepared assets.\n6. Use the handoff and review notes for Release Index ingestion.\n\nTrust levels:\n- Community            : Source-linked public release.\n- Provenance-attested  : GitHub artifact attestation verified.\n- Official             : ECHO-owned or explicitly approved publisher.\n- Blocked              : Prevented by Release Index policy.',
  'Verification Program':
    'The ECHO Verification Program reviews public projects and addon packages for:\n\n- Code quality and safety\n- Documentation completeness\n- User experience\n- Community feedback\n\nVerified releases receive:\n- A verified badge in the catalog\n- Priority in search results\n- Access to beta module APIs\n\nPrepare release assets in Release, then use the generated Release Index handoff and review notes for review.',
  'Best Practices':
    'Best practices for ECHO projects:\n\n1. Always namespace content to your creator ID\n2. Use public ECHO module contracts - never touch ECHO internals\n3. Add meaningful descriptions and tags\n4. Include localization keys for all user-facing text\n5. Test in Preview before packaging\n6. Version releases with semantic versioning\n7. Write a README and CHANGELOG\n8. Handle errors gracefully - never crash the runtime',
  'Examples':
    'See the Examples page for clonable starter projects:\n\n- Mission Pack Example\n- Recipe Pack Example\n- UI Addon Example\n- HoloMap Layer Example\n- Ashfall Expansion\n\nEach example generates a full project scaffold with working content, validation config and documentation.'
}

function guideRecommendations(moduleRoles: string[], runtimes: string[]): string[] {
  const guides = new Set<string>(['Manifest Reference', 'Validation'])
  if (moduleRoles.includes('missions')) guides.add('MissionCore')
  if (moduleRoles.includes('recipes')) guides.add('RecipeCore')
  if (moduleRoles.some((role) => ['interface', 'theme', 'terminal'].includes(role))) guides.add('ScreenCore')
  if (moduleRoles.includes('map')) guides.add('HoloMap')
  if (moduleRoles.includes('knowledge')) guides.add('Index')
  if (runtimes.includes('echo_native') || runtimes.includes('standalone')) guides.add('Package Contract')
  guides.add('Publishing')
  return Array.from(guides)
}

export default function Docs(): JSX.Element {
  const { activeProject } = useWorkspace()
  const [cat, setCat] = useState('Getting Started')
  const [catalog, setCatalog] = useState<EchoModuleRecord[]>(ECHO_MODULE_CATALOG)
  const snippet = SNIPPETS[cat]
  const manifest = activeProject?.manifest ?? null

  useEffect(() => {
    let cancelled = false
    window.studio
      .listEchoModules(activeProject?.path)
      .then((result) => {
        if (cancelled) return
        setCatalog(result.ok && result.data ? result.data.catalog : ECHO_MODULE_CATALOG)
      })
      .catch(() => {
        if (!cancelled) setCatalog(ECHO_MODULE_CATALOG)
      })
    return () => {
      cancelled = true
    }
  }, [activeProject?.path])

  const modulePlan = useMemo(() => manifest ? resolveProjectModulePlan(manifest, catalog) : null, [catalog, manifest])
  const guideText = useMemo(() => {
    if (!manifest || !modulePlan) {
      return 'Select a project to tailor these docs to its modules, runtimes, and release state.'
    }
    const roles = Array.from(new Set(modulePlan.closure.map((mod) => mod.role)))
    const modules = modulePlan.closure.length
      ? modulePlan.closure.map((mod) => mod.name).slice(0, 4).join(', ')
      : 'no recognized modules yet'
    const guides = guideRecommendations(roles, manifest.runtime.supports)
    return `${manifest.name} resolves ${modules}. Recommended: ${guides.join(', ')}.`
  }, [manifest, modulePlan])

  return (
    <Page title="Docs" subtitle="ECHO contracts and module docs built into the app. Detects your project and recommends guides.">
      <div className="split" style={{ gridTemplateColumns: '240px 1fr' }}>
        <div className="card" style={{ overflow: 'auto' }}>
          {CATEGORIES.map((c) => (
            <div
              key={c}
              className="tree-node"
              style={{ color: c === cat ? 'var(--accent)' : 'var(--text-dim)' }}
              onClick={() => setCat(c)}
            >
              {c}
            </div>
          ))}
        </div>
        <div className="card">
          <h3>{cat}</h3>
          <p className="dim" style={{ fontSize: 12 }}>
            {guideText}
          </p>
          {snippet ? (
            <>
              <div className="code">{snippet}</div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={() => navigator.clipboard.writeText(snippet)}>
                  Copy
                </button>
              </div>
            </>
          ) : (
            <p className="dim">Documentation for {cat} is available in the full ECHO reference.</p>
          )}
        </div>
      </div>
    </Page>
  )
}
