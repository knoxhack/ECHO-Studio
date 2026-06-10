import type { AddonManifest, Runtime, TargetExperience } from './types'

export interface PreviewScanProfile {
  name: string
  runtime: Runtime
  experiences: TargetExperience[]
  permissions: string[]
}

export const PREVIEW_SCAN_PROFILES: PreviewScanProfile[] = [
  {
    name: 'Ashfall Compatibility',
    runtime: 'neoforge',
    experiences: ['ashfall'],
    permissions: ['mission.register', 'recipe.register', 'holomap.layers', 'screen.custom_ui', 'index.entries']
  },
  {
    name: 'ECHO Prime Compatibility',
    runtime: 'echo_native',
    experiences: ['echo_prime'],
    permissions: ['mission.register', 'recipe.register', 'screen.custom_ui', 'index.entries']
  },
  {
    name: 'Arcana Compatibility',
    runtime: 'neoforge',
    experiences: ['arcana_division'],
    permissions: ['mission.register', 'recipe.register', 'holomap.layers', 'screen.custom_ui', 'index.entries']
  },
  {
    name: 'Generic Runtime Compatibility',
    runtime: 'standalone',
    experiences: ['generic', 'custom'],
    permissions: ['mission.register', 'recipe.register', 'screen.custom_ui', 'index.entries']
  },
  {
    name: 'Server Compatibility',
    runtime: 'neoforge',
    experiences: ['generic'],
    permissions: ['mission.register', 'recipe.register', 'index.entries']
  }
]

export const PREVIEW_SCAN_PROFILE_NAMES = PREVIEW_SCAN_PROFILES.map((profile) => profile.name)

const LEGACY_PROFILE_NAMES: Record<string, string> = {
  'Ashfall Sandbox': 'Ashfall Compatibility',
  'ECHO Prime Sandbox': 'ECHO Prime Compatibility',
  'Arcana Sandbox': 'Arcana Compatibility',
  'Generic ECHO Runtime Sandbox': 'Generic Runtime Compatibility',
  'Server Sandbox': 'Server Compatibility'
}

export function normalizePreviewScanProfile(profile: string): string {
  return LEGACY_PROFILE_NAMES[profile] ?? profile
}

export function getPreviewScanProfile(profile: string): PreviewScanProfile {
  const normalized = normalizePreviewScanProfile(profile)
  return PREVIEW_SCAN_PROFILES.find((item) => item.name === normalized) ?? PREVIEW_SCAN_PROFILES[3]
}

export function previewProfileForManifest(
  manifest: Pick<AddonManifest, 'runtime' | 'target'>,
  fallback = 'Ashfall Compatibility'
): string {
  const targets = new Set(manifest.target.experiences)
  const runtimes = new Set(manifest.runtime.supports)

  if (targets.has('ashfall')) return 'Ashfall Compatibility'
  if (targets.has('echo_prime')) return 'ECHO Prime Compatibility'
  if (targets.has('arcana_division')) return 'Arcana Compatibility'
  if ((targets.has('generic') || targets.has('custom')) && runtimes.has('standalone')) return 'Generic Runtime Compatibility'
  if (targets.has('generic') || targets.has('custom')) return 'Server Compatibility'
  if (runtimes.has('standalone')) return 'Generic Runtime Compatibility'
  if (runtimes.has('echo_native')) return 'ECHO Prime Compatibility'
  return PREVIEW_SCAN_PROFILE_NAMES.includes(normalizePreviewScanProfile(fallback))
    ? normalizePreviewScanProfile(fallback)
    : 'Ashfall Compatibility'
}

export interface PreviewScanLog {
  time: string
  level: 'info' | 'ok' | 'warn' | 'error'
  message: string
}

export interface PreviewScanResult {
  profile: string
  logs: PreviewScanLog[]
  compatibilityScore: number
  missingDependencies: string[]
  warnings: string[]
  errors: string[]
  contentLoaded: number
  contentFailed: number
}

export interface PreviewScanOptions {
  loadOnlySelected: boolean
  debugOverlay: boolean
  fakePlayer: boolean
  testInventory: boolean
}

export function computePreviewScore(
  missingDeps: number,
  warningCount: number,
  errorCount: number,
  contentFailed: number
): number {
  let score = 100
  score -= missingDeps * 10
  score -= warningCount * 3
  score -= errorCount * 15
  score -= contentFailed * 5
  return Math.max(0, Math.min(100, score))
}

export function previewScanAssistantPrompt(errors: string[]): string {
  const errorLines = errors
    .map((error) => error.trim())
    .filter(Boolean)
    .map((error) => `- ${error}`)
  return [
    'My preview compatibility scan found these errors:',
    errorLines.length ? errorLines.join('\n') : '- No preview errors were captured.',
    '',
    'Can you explain what went wrong and how to fix it?'
  ].join('\n')
}
