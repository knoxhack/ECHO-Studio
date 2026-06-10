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
