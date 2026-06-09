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

export function parsePng(input: Uint8Array): { valid: boolean; width?: number; height?: number; bitDepth?: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (input.length < 25) return { valid: false }
  for (let index = 0; index < sig.length; index += 1) {
    if (input[index] !== sig[index]) return { valid: false }
  }
  if (String.fromCharCode(input[12], input[13], input[14], input[15]) !== 'IHDR') return { valid: false }
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  return {
    valid: true,
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: input[24],
  }
}
