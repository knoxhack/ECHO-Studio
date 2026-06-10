// Mocked ECHO Studio Assistant. Produces canned contract-safe responses.
// Real model integration can replace generateAiReply later.

export interface AiAction {
  label: string
}

export interface AiReply {
  text: string
  files?: string[]
  actions?: AiAction[]
}

const SAFETY_NOTE =
  'I only use public ECHO contracts and approved modules, keep everything namespaced to your creator namespace, and never bypass validation.'

export function generateAiReply(prompt: string): AiReply {
  const p = prompt.toLowerCase()

  if (p.includes('mission')) {
    return {
      text: `Here's a mission pack scaffold for that idea. ${SAFETY_NOTE}`,
      files: [
        'missions/lost_convoy_01.json',
        'holomap/lost_convoy_markers.json',
        'index/lost_convoy_entries.json',
        'lang/en_us.json',
        'README.md'
      ],
      actions: [{ label: 'Apply Fix' }, { label: 'Review Diff' }, { label: 'Explain More' }]
    }
  }

  if (p.includes('fix') || p.includes('packos') || p.includes('validation') || p.includes('error')) {
    return {
      text: [
        'I found 3 issues:',
        '1. Reserved namespace echo',
        '2. Missing dependency MissionCore',
        '3. Missing localization key',
        '',
        'I can fix these by:',
        '- changing namespace to your creator namespace',
        '- adding the echo:mission_core dependency',
        '- generating missing lang entries'
      ].join('\n'),
      actions: [{ label: 'Apply Fix' }, { label: 'Review Diff' }, { label: 'Explain More' }]
    }
  }

  if (p.includes('recipe')) {
    return {
      text: `Here's a recipe definition using RecipeCore. ${SAFETY_NOTE}`,
      files: ['recipes/ash_alloy.json', 'index/ash_alloy_entry.json'],
      actions: [{ label: 'Apply Fix' }, { label: 'Review Diff' }]
    }
  }

  if (p.includes('readme') || p.includes('changelog') || p.includes('docs')) {
    return {
      text: 'I drafted documentation for your project, including a README and a starter CHANGELOG entry.',
      files: ['README.md', 'CHANGELOG.md'],
      actions: [{ label: 'Apply Fix' }]
    }
  }

  if (p.includes('manifest') || p.includes('mod.json')) {
    return {
      text: `I can generate a valid echo.mod.json with safe permissions and the right dependencies. ${SAFETY_NOTE}`,
      files: ['echo.mod.json'],
      actions: [{ label: 'Apply Fix' }, { label: 'Review Diff' }]
    }
  }

  return {
    text: `I'm the ECHO Studio Assistant. I can create missions, recipes, Index entries, HoloMap markers, manifests, and fix validation issues. ${SAFETY_NOTE}\n\nTry: "Create a mission pack for Ashfall about a lost convoy."`
  }
}
