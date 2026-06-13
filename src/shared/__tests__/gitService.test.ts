import { execFileSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { escapeArg, gitStatus } from '../../main/gitService'

describe('escapeArg', () => {
  it('passes through safe characters', () => {
    expect(escapeArg('hello')).toBe('hello')
    expect(escapeArg('path/to/file.txt')).toBe('path/to/file.txt')
  })

  it('quotes arguments with spaces', () => {
    expect(escapeArg('hello world')).toBe('"hello world"')
  })

  it('escapes double quotes', () => {
    expect(escapeArg('say "hello"')).toBe('"say \\"hello\\""')
  })
})

describe('gitStatus', () => {
  it('recognizes a local repository without an upstream remote', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-git-status-'))
    try {
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
      await fs.writeFile(path.join(root, 'echo.mod.json'), '{}', 'utf8')

      const status = await gitStatus(root)

      expect(status.isRepo).toBe(true)
      expect(status.branch).not.toBe('')
      expect(status.ahead).toBe(0)
      expect(status.behind).toBe(0)
      expect(status.files).toEqual([{ path: 'echo.mod.json', status: '??' }])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('reports non-repositories without throwing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-git-status-'))
    try {
      await expect(gitStatus(root)).resolves.toMatchObject({ isRepo: false, branch: '' })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
