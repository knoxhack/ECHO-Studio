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
