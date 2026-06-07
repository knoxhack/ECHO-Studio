import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { readManifest, listAssetFiles } from './fsService'
import { readAllContent, readLangKeys } from './contentService'
import { runProjectCheck } from '../shared/projectValidation'
import type { PackOSReport } from '../shared/types'
import type { PackageResult } from '../shared/publishing'

const EXCLUDE_DIRS = new Set(['.studio', 'exports', 'node_modules', '.git'])

function localId(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}

// Run the full project check (used before packaging).
export async function fullProjectReport(projectPath: string): Promise<PackOSReport> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const all = await readAllContent(projectPath)
  const content: Record<string, { id: string; data: unknown }[]> = {}
  for (const [type, records] of Object.entries(all)) {
    content[type] = records.map((r) => ({ id: r.id, data: r.data }))
  }
  const langKeys = await readLangKeys(projectPath)
  const assetFiles = await listAssetFiles(projectPath)
  return runProjectCheck({ manifest, content: content as never, langKeys, assetFiles })
}

// Build a distributable .zip of the project (excludes .studio/, exports/, etc.),
// writes packos.report.json into the bundle, and returns a content hash.
export async function packageAddon(projectPath: string): Promise<PackageResult> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const report = await fullProjectReport(projectPath)

  const zip = new AdmZip()
  const entries = await fs.readdir(projectPath, { withFileTypes: true })
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue
    const full = join(projectPath, e.name)
    if (e.isDirectory()) zip.addLocalFolder(full, e.name)
    else zip.addLocalFile(full)
  }
  // Embed the validation report.
  zip.addFile('packos.report.json', Buffer.from(JSON.stringify(report, null, 2), 'utf-8'))

  const buffer = zip.toBuffer()
  const hash = createHash('sha256').update(buffer).digest('hex')

  const exportsDir = join(projectPath, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const zipPath = join(exportsDir, `${manifest.namespace}_${localId(manifest.id)}-${manifest.version}.zip`)
  await fs.writeFile(zipPath, buffer)

  return { zipPath, hash, bytes: buffer.length, report }
}
