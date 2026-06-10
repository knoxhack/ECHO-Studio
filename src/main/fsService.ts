import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import AdmZip from 'adm-zip'
import type {
  AddonManifest,
  AddonProject,
  CreateAddonOptions,
  FileNode,
  PublishStatus
} from '../shared/types'
import { buildManifest, buildProjectFiles } from '../shared/templates'
import { templateById } from '../shared/templateLibrary'

// Default workspace where projects live. Stored under userData so it is writable.
export function defaultWorkspace(): string {
  return join(app.getPath('documents'), 'ECHO Studio', 'Workspace')
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

// Create a new addon project on disk. Returns the created project path.
export async function createAddon(opts: CreateAddonOptions): Promise<string> {
  const workspace = opts.workspaceDir || defaultWorkspace()
  await ensureDir(workspace)
  const folderName = `${opts.namespace}_${opts.addonId}`
  const projectDir = join(workspace, folderName)
  if (await pathExists(projectDir)) {
    throw new Error(`A project folder already exists: ${folderName}`)
  }
  const manifest = buildManifest(opts)
  const files = buildProjectFiles(opts, manifest)

  for (const [rel, content] of Object.entries(files)) {
    const full = join(projectDir, rel)
    await ensureDir(join(full, '..'))
    await fs.writeFile(full, content, 'utf-8')
  }
  return projectDir
}

// Create a project from a named template (full file map layered on the base).
export async function createFromTemplate(
  workspaceDir: string,
  templateId: string,
  namespace: string,
  addonId: string,
  name: string
): Promise<string> {
  const tmpl = templateById(templateId)
  if (!tmpl) throw new Error(`Unknown template: ${templateId}`)
  const opts: CreateAddonOptions = {
    workspaceDir,
    type: tmpl.type,
    target: tmpl.target,
    namespace,
    addonId,
    name,
    description: tmpl.description,
    runtimes: tmpl.runtimes,
    options: tmpl.options
  }
  const workspace = workspaceDir || defaultWorkspace()
  await ensureDir(workspace)
  const folderName = `${namespace}_${addonId}`
  const projectDir = join(workspace, folderName)
  if (await pathExists(projectDir)) throw new Error(`A project folder already exists: ${folderName}`)

  const manifest = buildManifest(opts)
  const files = buildProjectFiles(opts, manifest)
  const extra = tmpl.extraFiles?.({ namespace, addonId, name }) ?? {}
  const all = { ...files, ...extra }
  for (const [rel, content] of Object.entries(all)) {
    const full = join(projectDir, rel)
    await ensureDir(join(full, '..'))
    await fs.writeFile(full, content, 'utf-8')
  }
  return projectDir
}

// Import an existing addon from a folder or zip into the workspace.
export async function importProject(workspaceDir: string, sourcePath: string): Promise<string> {
  const workspace = workspaceDir || defaultWorkspace()
  await ensureDir(workspace)
  const isZip = sourcePath.toLowerCase().endsWith('.zip')

  if (isZip) {
    const extractDir = join(workspace, '_import_temp_' + Date.now())
    await ensureDir(extractDir)
    const zip = new AdmZip(sourcePath)
    zip.extractAllTo(extractDir, true)
    // If the zip contains a single root folder, use that.
    const entries = await fs.readdir(extractDir, { withFileTypes: true })
    const root = entries.length === 1 && entries[0].isDirectory()
      ? join(extractDir, entries[0].name)
      : extractDir
    const manifestPath = join(root, 'echo.mod.json')
    if (!(await pathExists(manifestPath))) {
      throw new Error('Imported zip does not contain echo.mod.json')
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AddonManifest
    const folderName = `${manifest.namespace}_${manifest.id.replace(/:/g, '_')}`
    const dest = join(workspace, folderName)
    if (await pathExists(dest)) throw new Error(`Project ${folderName} already exists in workspace`)
    await fs.cp(root, dest, { recursive: true })
    // cleanup temp
    await fs.rm(extractDir, { recursive: true, force: true })
    return dest
  } else {
    const manifestPath = join(sourcePath, 'echo.mod.json')
    if (!(await pathExists(manifestPath))) {
      throw new Error('Selected folder does not contain echo.mod.json')
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AddonManifest
    const folderName = `${manifest.namespace}_${manifest.id.replace(/:/g, '_')}`
    const dest = join(workspace, folderName)
    if (await pathExists(dest)) throw new Error(`Project ${folderName} already exists in workspace`)
    await fs.cp(sourcePath, dest, { recursive: true })
    return dest
  }
}

async function readPublishStatus(projectDir: string): Promise<PublishStatus> {
  const statusFile = join(projectDir, '.studio', 'status.json')
  if (await pathExists(statusFile)) {
    try {
      const raw = JSON.parse(await fs.readFile(statusFile, 'utf-8'))
      return raw.publishStatus ?? 'draft'
    } catch {
      return 'draft'
    }
  }
  return 'draft'
}

export async function setPublishStatus(projectPath: string, status: PublishStatus): Promise<void> {
  const dir = join(projectPath, '.studio')
  await ensureDir(dir)
  await fs.writeFile(join(dir, 'status.json'), JSON.stringify({ publishStatus: status }, null, 2), 'utf-8')
}

// List all projects in a workspace (folders containing echo.mod.json).
export async function listProjects(workspaceDir: string): Promise<AddonProject[]> {
  const workspace = workspaceDir || defaultWorkspace()
  await ensureDir(workspace)
  const entries = await fs.readdir(workspace, { withFileTypes: true })
  const projects: AddonProject[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const projectDir = join(workspace, entry.name)
    const manifestPath = join(projectDir, 'echo.mod.json')
    if (!(await pathExists(manifestPath))) continue
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AddonManifest
      const stat = await fs.stat(manifestPath)
      projects.push({
        path: projectDir,
        folderName: entry.name,
        manifest,
        lastEdited: stat.mtimeMs,
        publishStatus: await readPublishStatus(projectDir)
      })
    } catch {
      // Skip malformed projects.
    }
  }
  return projects.sort((a, b) => b.lastEdited - a.lastEdited)
}

export async function readManifest(projectPath: string): Promise<AddonManifest | null> {
  const path = join(projectPath, 'echo.mod.json')
  try {
    const raw = await fs.readFile(path, 'utf-8')
    return JSON.parse(raw) as AddonManifest
  } catch {
    return null
  }
}

export async function writeManifest(projectPath: string, manifest: AddonManifest): Promise<void> {
  await fs.writeFile(join(projectPath, 'echo.mod.json'), JSON.stringify(manifest, null, 2), 'utf-8')
}

// Build a file tree for the project explorer.
export async function readProjectTree(projectPath: string): Promise<FileNode> {
  async function walk(dir: string): Promise<FileNode> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const children: FileNode[] = []
    for (const e of entries) {
      if (e.name === '.studio') continue
      const full = join(dir, e.name)
      if (e.isDirectory()) children.push(await walk(full))
      else children.push({ name: e.name, path: full, type: 'file' })
    }
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { name: basename(dir), path: dir, type: 'dir', children }
  }
  return walk(projectPath)
}

export async function readFileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

// List asset file paths relative to assets/ (recursive), ignoring .gitkeep.
export async function listAssetFiles(projectPath: string): Promise<string[]> {
  const root = join(projectPath, 'assets')
  const out: string[] = []
  async function walk(dir: string, rel: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === '.gitkeep') continue
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(join(dir, e.name), relPath)
      else out.push(relPath)
    }
  }
  await walk(root, '')
  return out
}

export async function writeFileText(filePath: string, content: string): Promise<void> {
  await ensureDir(join(filePath, '..'))
  await fs.writeFile(filePath, content, 'utf-8')
}
