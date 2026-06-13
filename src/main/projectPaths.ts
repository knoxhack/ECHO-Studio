import { promises as fs } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function realPathOrResolved(path: string): Promise<string> {
  return fs.realpath(path).catch(() => resolve(path))
}

async function targetPathForCheck(targetPath: string): Promise<string> {
  return fs.realpath(targetPath).catch(async () => {
    const parent = await realPathOrResolved(dirname(targetPath))
    return resolve(parent, basename(targetPath))
  })
}

export async function resolveProjectRoot(projectPath: string): Promise<string> {
  if (!projectPath || projectPath.includes('\0')) throw new Error('Project path is required.')
  const root = await realPathOrResolved(projectPath)
  await fs.access(join(root, 'echo.mod.json'))
  return root
}

export async function resolveProjectPath(projectPath: string, targetPath: string, label = 'Path'): Promise<string> {
  if (!targetPath || targetPath.includes('\0')) throw new Error(`${label} is required.`)
  const root = await resolveProjectRoot(projectPath)
  const target = await targetPathForCheck(resolve(targetPath))
  if (!isInside(root, target)) {
    throw new Error(`${label} must stay inside the active project.`)
  }
  return target
}

export async function resolveProjectRelativePath(projectPath: string, relativePath: string, label = 'Path'): Promise<string> {
  if (
    !relativePath ||
    relativePath.includes('\0') ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).some((part) => part === '..')
  ) {
    throw new Error(`${label} must be a safe project-relative path.`)
  }
  const root = await resolveProjectRoot(projectPath)
  return resolveProjectPath(root, join(root, relativePath), label)
}
