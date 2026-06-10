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

export type SandboxLog = PreviewScanLog
export type SandboxResult = PreviewScanResult
export type SandboxOptions = PreviewScanOptions
export const computeSandboxScore = computePreviewScore
