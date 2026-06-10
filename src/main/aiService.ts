import { getConfig } from './config'
import { readManifest } from './fsService'
import type { AiChatResult, AiFile } from '../shared/config'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SAFETY_SYSTEM = `You are the ECHO Studio assistant.
You help creators build ECHO projects on top of the ECHO Platform using ONLY the public ECHO SDK.

Hard rules you must always follow:
- Use ONLY the public ECHO SDK. Never reference ECHO Core internals, the Native Loader, or private APIs.
- Never use the reserved "echo:" namespace for creator content; always namespace content to the creator's namespace.
- Never bypass or disable PackOS validation. Never request restricted permissions
  (file_system.write_global, runtime.internal, launcher.catalog.write, packos.policy.modify, official_signature.use).
- Explain every permission you add.
- Keep all content namespaced to the creator.

When the user asks you to create content (missions, recipes, Index entries, HoloMap markers, manifests,
README/changelog), output a short explanation, then a single fenced code block tagged "echo-files"
containing a JSON array of files: [{ "path": "missions/foo.json", "content": "..." }].
Only include the echo-files block when you are actually generating files.`

// Extract an echo-files JSON block from model output, if present.
function parseFiles(text: string): { text: string; files?: AiFile[] } {
  const match = text.match(/```echo-files\s*([\s\S]*?)```/)
  if (!match) return { text }
  try {
    const files = JSON.parse(match[1].trim()) as AiFile[]
    const cleaned = text.replace(match[0], '').trim()
    return { text: cleaned, files }
  } catch {
    return { text }
  }
}

// Deterministic mock generation (used when no API key is configured).
function mockGenerate(prompt: string, namespace: string): AiChatResult {
  const p = prompt.toLowerCase()
  const ns = namespace || 'teamnova'

  if (p.includes('mission')) {
    const id = 'lost_convoy_01'
    return {
      usedModel: false,
      text: `Here's a mission pack scaffold about that idea. I used your namespace "${ns}" and only public SDK modules (MissionCore, HoloMap, Index).`,
      files: [
        {
          path: `missions/${id}.json`,
          content: JSON.stringify(
            {
              id: `${ns}:${id}`,
              title: 'Lost Convoy',
              description: 'Track down the lost supply convoy in the ashfields.',
              objective: { type: 'visit_location', target: `${ns}:convoy_wreck` },
              completion: 'reach_target',
              rewards: [{ item: `${ns}:supply_crate`, count: 1 }]
            },
            null,
            2
          )
        },
        {
          path: 'holomap/lost_convoy_markers.json',
          content: JSON.stringify(
            { id: `${ns}:lost_convoy_layer`, title: 'Lost Convoy', type: 'poi', markers: [{ id: `${ns}:convoy_marker`, title: 'Convoy Wreck', icon: 'wreck', x: 64, z: 48, linkedMission: `${ns}:${id}` }] },
            null,
            2
          )
        }
      ]
    }
  }
  if (p.includes('recipe')) {
    return {
      usedModel: false,
      text: 'A RecipeCore machine recipe for ash alloy, namespaced to you.',
      files: [
        {
          path: 'recipes/ash_alloy.json',
          content: JSON.stringify({ id: `${ns}:ash_alloy`, type: 'machine_recipe', machine: `${ns}:grinder`, inputs: [{ item: `${ns}:rubble`, count: 4 }], output: { item: `${ns}:ash_alloy`, count: 1 }, time: 200, energy: 100 }, null, 2)
        }
      ]
    }
  }
  if (p.includes('readme') || p.includes('changelog') || p.includes('docs')) {
    return {
      usedModel: false,
      text: 'Drafted a README and a starter changelog.',
      files: [
        { path: 'README.md', content: `# ${ns} project\n\nBuilt with ECHO Studio.\n` },
        { path: 'CHANGELOG.md', content: `# Changelog\n\n## 0.1.0\n- Initial release.\n` }
      ]
    }
  }
  if (p.includes('fix') || p.includes('packos') || p.includes('error')) {
    return {
      usedModel: false,
      text: 'Common PackOS fixes: change reserved namespace to your creator namespace, add echo:mission_core when registering missions, and generate missing localization, Index, or HoloMap links. Use Validation for the report, then review Codex Tasks for diff-based fixes before applying them.'
    }
  }
  return {
    usedModel: false,
    text: `I'm the ECHO Studio assistant. I can generate missions, recipes, Index entries, HoloMap markers, manifests, and local workspace repair plans, all namespaced to "${ns}" and using only the public ECHO SDK. Add an API key in Settings for full model-powered generation.`
  }
}

async function callModel(messages: ChatMessage[]): Promise<string> {
  const cfg = (await getConfig()).ai
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4 }),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`AI request failed: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content ?? '(no response)'
  } finally {
    clearTimeout(timeout)
  }
}

// Main entry: chat with optional project context. Falls back to mock when no key.
export async function chat(
  projectPath: string | null,
  history: ChatMessage[]
): Promise<AiChatResult> {
  const cfg = await getConfig()
  let namespace = 'teamnova'
  let manifestNote = ''
  if (projectPath) {
    try {
      const m = await readManifest(projectPath)
      if (m) {
        namespace = m.namespace
        const targetModules = m.target.modules.length ? m.target.modules.join(', ') : 'none'
        const requiredModules = m.dependencies.required.length ? m.dependencies.required.join(', ') : 'none'
        manifestNote = `\nActive project: ${m.id} (namespace "${m.namespace}"), target ${m.target.experiences.join(', ')}, target modules ${targetModules}, required modules ${requiredModules}.`
      }
    } catch {
      /* no manifest */
    }
  }

  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? ''

  if (!cfg.ai.enabled || !cfg.ai.apiKey) {
    return mockGenerate(lastUser, namespace)
  }

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: SAFETY_SYSTEM + manifestNote },
      ...history
    ]
    const raw = await callModel(messages)
    const parsed = parseFiles(raw)
    return { text: parsed.text, files: parsed.files, usedModel: true }
  } catch (err) {
    // Graceful fallback to mock on any model error.
    const mock = mockGenerate(lastUser, namespace)
    mock.text = `(AI error, using offline assistant: ${err instanceof Error ? err.message : err})\n\n${mock.text}`
    return mock
  }
}
