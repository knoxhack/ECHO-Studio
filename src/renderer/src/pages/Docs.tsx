import { useState } from 'react'
import { Page } from '../components/Page'

const CATEGORIES = [
  'Getting Started',
  'Addon SDK',
  'Manifest Reference',
  'Package Contract',
  'Content Types',
  'MissionCore',
  'RecipeCore',
  'ScreenCore',
  'HoloMap',
  'Index',
  'Assets',
  'PackOS Validation',
  'Publishing',
  'Verification Program',
  'Best Practices',
  'Examples'
]

const SNIPPETS: Record<string, string> = {
  'Getting Started':
    'ECHO Studio lets you build on top of ECHO without starting from raw files.\n\n1. Create an experience, addon, module, or pack from a template.\n2. Choose ECHO Modules and set up the local dev workspace.\n3. Run preview clients and local builds.\n4. Validate with PackOS.\n5. Package local release assets before GitHub publishing.',
  'Addon SDK':
    'The ECHO Addon SDK provides public APIs for:\n- MissionCore (missions, objectives, rewards)\n- RecipeCore (crafting recipes, machine recipes)\n- ScreenCore (custom UI screens)\n- HoloMap (map layers and markers)\n- Index (lore entries)\n\nAll content must be namespaced to the creator.\nUse ONLY the permissions listed in the SDK documentation.',
  'Manifest Reference':
    '{\n  "schemaVersion": 1,\n  "id": "teamnova:orbital_colonies",\n  "name": "Orbital Colonies",\n  "version": "0.3.0",\n  "namespace": "teamnova",\n  "description": "A brief description of what your addon does.",\n  "developerType": "addon_developer",\n  "publisher": {\n    "id": "teamnova",\n    "name": "Team Nova",\n    "type": "team"\n  },\n  "projectClass": "gameplay_addon",\n  "target": {\n    "experiences": ["ashfall"],\n    "modules": []\n  },\n  "runtime": {\n    "supports": ["neoforge"],\n    "nativeReadiness": "none",\n    "minimumEchoSdk": "1.4.0"\n  },\n  "permissions": ["mission.register", "holomap.layers"],\n  "dependencies": {\n    "required": ["echo:core", "echo:mission_core"],\n    "optional": []\n  },\n  "trust": {\n    "level": "community",\n    "signed": false,\n    "verified": false\n  },\n  "support": {\n    "tier": "community",\n    "issues": "https://github.com/teamnova/issues"\n  },\n  "tags": ["echo", "addon", "gameplay"]\n}',
  'Package Contract':
    '{\n  "schemaVersion": "echo.addon.package.v1",\n  "id": "orbital_colonies",\n  "version": "0.3.0",\n  "publisher": {\n    "githubOwner": "teamnova",\n    "githubRepo": "orbital-colonies-addon"\n  },\n  "targets": ["native", "neoforge", "standalone"],\n  "dependencies": [\n    { "id": "echo:core", "kind": "module", "version": "*" }\n  ],\n  "artifacts": {\n    "native": "orbital_colonies-0.3.0.echo-addon",\n    "neoforge": "orbital_colonies-0.3.0-neoforge.jar",\n    "standalone": "orbital_colonies-0.3.0-standalone.jar",\n    "sources": "orbital_colonies-0.3.0-sources.jar"\n  }\n}',
  'Content Types':
    'ECHO Studio supports these content types:\n\n- mission    : Quests with objectives and rewards\n- recipe     : Crafting and machine recipes\n- screen     : Custom UI screens (ScreenCore)\n- holomap    : Map layers and markers\n- index      : Lore and data entries\n- item       : Custom items and blocks\n\nEach type has its own folder and JSON schema. Use visual builders first, then Advanced for raw files.',
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
  'PackOS Validation':
    'PackOS is the core safety gate. It checks:\n\n1. Namespace safety - no reserved "echo:" namespace\n2. Permission safety - no blocked internal permissions\n3. Dependency completeness - required SDK modules present\n4. Version format - semantic versioning\n5. Content integrity - no broken references\n6. Publishing readiness - description, tags, support link\n\nRun Validation before every release. Use Codex Tasks for reviewable repair plans.',
  'Publishing':
    'To publish your addon:\n\n1. Run PackOS Check and resolve all BLOCKERs and ERRORs.\n2. Prepare release assets from the Publish Assistant.\n3. Review echo-addon-package.json, echo-release.json, checksums.sha256, and release-index-handoff.json.\n4. Connect the GitHub App or GitHub CLI provider.\n5. Create a GitHub Release draft and upload the prepared assets.\n6. Submit the handoff for Release Index ingestion.\n\nTrust levels:\n- Community            : Source-linked public release.\n- Provenance-attested  : GitHub artifact attestation verified.\n- Official             : ECHO-owned or explicitly approved publisher.\n- Blocked              : Prevented by Release Index policy.',
  'Verification Program':
    'The ECHO Verification Program reviews addons for:\n\n- Code quality and safety\n- Documentation completeness\n- User experience\n- Community feedback\n\nVerified addons receive:\n- A verified badge in the catalog\n- Priority in search results\n- Access to beta SDK features\n\nApply via the Submit Addon page.',
  'Best Practices':
    'Best practices for ECHO projects:\n\n1. Always namespace content to your creator ID\n2. Use the public SDK - never touch ECHO internals\n3. Add meaningful descriptions and tags\n4. Include localization keys for all user-facing text\n5. Test in Preview before packaging\n6. Version releases with semantic versioning\n7. Write a README and CHANGELOG\n8. Handle errors gracefully - never crash the runtime',
  'Examples':
    'See the Examples page for clonable starter projects:\n\n- Mission Pack Example\n- Recipe Pack Example\n- UI Addon Example\n- HoloMap Layer Example\n- Ashfall Expansion\n\nEach example generates a full project scaffold with working content, validation config and documentation.'
}

export default function Docs(): JSX.Element {
  const [cat, setCat] = useState('Getting Started')
  const snippet = SNIPPETS[cat]
  return (
    <Page title="Docs" subtitle="SDK documentation built into the app. Detects your project and recommends guides.">
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
            This project uses MissionCore. Recommended: Mission Pack Guide, HoloMap Marker Guide,
            Reward Setup Guide.
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
            <p className="dim">Documentation for {cat} is available in the full SDK reference.</p>
          )}
        </div>
      </div>
    </Page>
  )
}
