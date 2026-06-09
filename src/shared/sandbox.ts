export interface SandboxLog {
  time: string
  level: 'info' | 'ok' | 'warn' | 'error'
  message: string
}

export interface SandboxResult {
  profile: string
  logs: SandboxLog[]
  compatibilityScore: number
  missingDependencies: string[]
  warnings: string[]
  errors: string[]
  contentLoaded: number
  contentFailed: number
}

export interface SandboxOptions {
  loadOnlySelected: boolean
  debugOverlay: boolean
  fakePlayer: boolean
  testInventory: boolean
}

export function computeSandboxScore(
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
