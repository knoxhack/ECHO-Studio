export interface AssetInfo {
  rel: string
  kind: 'texture' | 'model' | 'sound' | 'icon' | 'other'
  bytes: number
  width?: number
  height?: number
  valid: boolean
  issues: string[]
}

export interface AssetReport {
  assets: AssetInfo[]
  problems: { level: 'WARNING' | 'ERROR' | 'INFO'; message: string }[]
}
