import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveProjectPath, resolveProjectRelativePath, resolveProjectRoot } from '../../main/projectPaths'

async function withProject(run: (project: string, root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-project-paths-'))
  try {
    const project = path.join(root, 'project')
    await fs.mkdir(project, { recursive: true })
    await fs.writeFile(path.join(project, 'echo.mod.json'), '{}', 'utf8')
    await run(project, root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('project path guards', () => {
  it('resolves project roots only when an echo.mod.json exists', async () => {
    await withProject(async (project, root) => {
      await expect(resolveProjectRoot(project)).resolves.toBe(await fs.realpath(project))
      await expect(resolveProjectRoot(root)).rejects.toThrow()
    })
  })

  it('allows absolute paths inside the active project', async () => {
    await withProject(async (project) => {
      const file = path.join(project, 'content', 'entry.json')

      await expect(resolveProjectPath(project, file, 'File path')).resolves.toBe(file)
    })
  })

  it('rejects absolute paths outside the active project', async () => {
    await withProject(async (project, root) => {
      const outside = path.join(root, 'outside.json')

      await expect(resolveProjectPath(project, outside, 'File path')).rejects.toThrow(
        'File path must stay inside the active project.'
      )
    })
  })

  it('rejects unsafe project-relative paths', async () => {
    await withProject(async (project) => {
      await expect(resolveProjectRelativePath(project, '../outside.json', 'AI file path')).rejects.toThrow(
        'AI file path must be a safe project-relative path.'
      )
    })
  })
})
