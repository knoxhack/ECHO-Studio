import { promises as fs } from 'fs'
import { join, extname, basename } from 'path'
import { dialog, BrowserWindow } from 'electron'
import AdmZip from 'adm-zip'
import { listAssetFiles, readManifest } from './fsService'
import { readAllContent } from './contentService'
import type { AssetInfo, AssetReport } from '../shared/assets'

// Parse a PNG header. Returns dimensions + validity without a native lib.
export function parsePng(buf: Buffer): { valid: boolean; width?: number; height?: number; bitDepth?: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length < 24) return { valid: false }
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return { valid: false }
  // IHDR chunk starts at byte 8: length(4) + 'IHDR'(4) + width(4) + height(4) + bitDepth(1)
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return { valid: false }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  return { valid: true, width, height, bitDepth }
}

function kindFor(rel: string): AssetInfo['kind'] {
  const ext = extname(rel).toLowerCase()
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    return rel.includes('icon') ? 'icon' : 'texture'
  }
  if (ext === '.json') return 'model'
  if (ext === '.ogg' || ext === '.wav' || ext === '.mp3') return 'sound'
  return 'other'
}

const VALID_SIZES = [16, 32, 64, 128, 256]

export async function scanAssets(projectPath: string): Promise<AssetReport> {
  const rels = await listAssetFiles(projectPath)
  const assets: AssetInfo[] = []

  for (const rel of rels) {
    const full = join(projectPath, 'assets', rel)
    const info: AssetInfo = { rel, kind: kindFor(rel), bytes: 0, valid: true, issues: [] }
    try {
      const buf = await fs.readFile(full)
      info.bytes = buf.length
      if (extname(rel).toLowerCase() === '.png') {
        const png = parsePng(buf)
        if (!png.valid) {
          info.valid = false
          info.issues.push('Invalid or corrupt PNG')
        } else {
          info.width = png.width
          info.height = png.height
          if (png.width !== png.height) info.issues.push('Texture is not square')
          else if (!VALID_SIZES.includes(png.width!)) info.issues.push(`Unusual resolution ${png.width}x${png.height}`)
        }
        if (buf.length < 200) info.issues.push('Possible placeholder (very small file)')
      }
    } catch {
      info.valid = false
      info.issues.push('Could not read file')
    }
    assets.push(info)
  }

  const problems: AssetReport['problems'] = []

  // Duplicate base names.
  const names = new Map<string, number>()
  for (const a of assets) {
    const n = basename(a.rel)
    names.set(n, (names.get(n) ?? 0) + 1)
  }
  for (const [n, c] of names) if (c > 1) problems.push({ level: 'WARNING', message: `Duplicate asset name: ${n} (${c} copies)` })

  // Cross-reference content for missing/unused textures.
  try {
    const manifest = await readManifest(projectPath)
    const content = await readAllContent(projectPath)
    const referenced = new Set<string>()
    for (const it of content.item) {
      const data = it.data as { texture?: string; model?: string }
      if (data.texture) referenced.add(data.texture)
      if (data.model) referenced.add(data.model)
    }
    // Items declaring a texture/model that has no matching asset file.
    const textureNames = new Set(assets.filter((a) => a.kind === 'texture' || a.kind === 'icon').map((a) => basename(a.rel, extname(a.rel))))
    for (const ref of referenced) {
      const refName = ref.includes(':') ? ref.split(':')[1] : ref
      if (!textureNames.has(refName)) problems.push({ level: 'WARNING', message: `Referenced texture/model "${ref}" has no asset file.` })
    }
    if (manifest?.permissions.includes('screen.custom_ui') && assets.length === 0) {
      problems.push({ level: 'INFO', message: 'UI addon has no assets yet.' })
    }
  } catch {
    /* manifest/content optional */
  }

  for (const a of assets) for (const iss of a.issues) problems.push({ level: a.valid ? 'WARNING' : 'ERROR', message: `${a.rel}: ${iss}` })

  return { assets, problems }
}

function getDialogParent(): BrowserWindow {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

// Import one or more files into assets/<targetFolder>.
export async function importAssets(projectPath: string, targetFolder: string): Promise<string[]> {
  const win = getDialogParent()
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Assets', extensions: ['png', 'jpg', 'jpeg', 'ogg', 'wav', 'json'] }]
  })
  if (res.canceled) return []
  const destDir = join(projectPath, 'assets', targetFolder)
  await fs.mkdir(destDir, { recursive: true })
  const copied: string[] = []
  for (const src of res.filePaths) {
    const dest = join(destDir, basename(src))
    await fs.copyFile(src, dest)
    copied.push(`${targetFolder}/${basename(src)}`)
  }
  return copied
}

// Export assets/ as a zip into the project's exports/ folder.
export async function exportAssetPack(projectPath: string): Promise<string> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const zip = new AdmZip()
  const assetsDir = join(projectPath, 'assets')
  zip.addLocalFolder(assetsDir, 'assets')
  const exportsDir = join(projectPath, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const out = join(exportsDir, `${manifest.namespace}_${localId(manifest.id)}-assets.zip`)
  zip.writeZip(out)
  return out
}

function localId(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}
