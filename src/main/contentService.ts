import { promises as fs } from 'fs'
import { join } from 'path'
import type { ContentRecord, ContentType } from '../shared/content/schemas'
import { CONTENT_FOLDER, idToFileName } from '../shared/content/paths'

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

function folderFor(projectPath: string, type: ContentType): string {
  return join(projectPath, CONTENT_FOLDER[type])
}

// Read every JSON file in the content folder. For holomap layers and index the
// file may contain either a single object or a wrapper { markers: [...] } /
// { entries: [...] } - we normalise to flat records keyed by `id`.
export async function listContent(
  projectPath: string,
  type: ContentType
): Promise<ContentRecord[]> {
  const dir = folderFor(projectPath, type)
  await ensureDir(dir)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const records: ContentRecord[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue
    const full = join(dir, e.name)
    try {
      const raw = JSON.parse(await fs.readFile(full, 'utf-8'))
      const items = unwrap(type, raw)
      for (const item of items) {
        const obj = item as Record<string, unknown>
        records.push({
          id: (obj.id as string) ?? e.name.replace(/\.json$/, ''),
          fileName: e.name,
          path: full,
          data: item
        })
      }
    } catch {
      // Skip malformed files.
    }
  }
  return records.sort((a, b) => a.id.localeCompare(b.id))
}

// Some legacy/template files wrap content. Normalise to an array of records.
export function unwrap(type: ContentType, raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown> | null
  if (type === 'index' && Array.isArray(obj?.entries)) return obj.entries as unknown[]
  if (type === 'holomap' && Array.isArray(obj?.markers)) {
    // Legacy marker file -> synthesize a layer record.
    return [{ id: (obj.layer as string) ?? 'layer', title: 'Layer', type: 'poi', markers: obj.markers }]
  }
  return [raw]
}

export async function readContent(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'))
}

// Write a single content item to its own file (one item per file).
export async function writeContent(
  projectPath: string,
  type: ContentType,
  item: { id: string }
): Promise<string> {
  const dir = folderFor(projectPath, type)
  await ensureDir(dir)
  const full = join(dir, idToFileName(item.id))
  await fs.writeFile(full, JSON.stringify(item, null, 2), 'utf-8')
  return full
}

export async function deleteContent(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true })
}

// Gather every content record across all types (used by full project check).
export async function readAllContent(
  projectPath: string
): Promise<Record<ContentType, ContentRecord[]>> {
  const types = Object.keys(CONTENT_FOLDER) as ContentType[]
  const out = {} as Record<ContentType, ContentRecord[]>
  await Promise.all(
    types.map(async (t) => {
      out[t] = await listContent(projectPath, t)
    })
  )
  return out
}

// Read localization keys present in lang/en_us.json (for validation).
export async function readLangKeys(projectPath: string): Promise<string[]> {
  try {
    const raw = JSON.parse(await fs.readFile(join(projectPath, 'lang', 'en_us.json'), 'utf-8'))
    return Object.keys(raw)
  } catch {
    return []
  }
}
