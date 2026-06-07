import { execSync } from 'child_process'
import type { GitStatus, GitCommit, GitDiff, GitResult, GitBranch } from '../shared/git'

interface SpawnResult {
  ok: boolean
  output: string
  error?: string
}

function run(cwd: string, args: string[]): string {
  const result = spawnSync(cwd, args)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

function spawnSync(cwd: string, args: string[]): { stdout: string; stderr: string; status: number | null; error?: Error } {
  try {
    const stdout = execSync(`git ${args.map(escapeArg).join(' ')}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { stdout, stderr: '', status: 0 }
  } catch (err: any) {
    return { stdout: '', stderr: err.stderr || err.message, status: err.status ?? 1, error: err }
  }
}

export function escapeArg(arg: string): string {
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(arg)) return arg
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`
}

function runSafe(cwd: string, args: string[]): SpawnResult {
  const result = spawnSync(cwd, args)
  if (result.error || result.status !== 0) {
    return { ok: false, output: '', error: result.stderr || result.error?.message || 'git command failed' }
  }
  return { ok: true, output: result.stdout }
}

export async function gitStatus(projectPath: string): Promise<GitStatus> {
  try {
    const branch = run(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const aheadBehind = run(projectPath, ['rev-list', '--left-right', '--count', `origin/${branch}...${branch}`]).trim()
    const [behind, ahead] = aheadBehind.split(/\s+/).map(Number)
    const statusRaw = run(projectPath, ['status', '--porcelain'])
    const files = statusRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => ({
        path: line.slice(3).trim(),
        status: line.slice(0, 2).trim()
      }))
    return { isRepo: true, branch, ahead: ahead || 0, behind: behind || 0, files }
  } catch {
    return { isRepo: false, branch: '', ahead: 0, behind: 0, files: [] }
  }
}

export async function gitInit(projectPath: string): Promise<GitResult> {
  const res = runSafe(projectPath, ['init'])
  return { ok: res.ok, output: res.output, error: res.error }
}

export async function gitCommit(projectPath: string, message: string): Promise<GitResult> {
  const add = runSafe(projectPath, ['add', '-A'])
  if (!add.ok) return { ok: false, error: add.error }
  const commit = runSafe(projectPath, ['commit', '-m', message])
  return { ok: commit.ok, output: commit.output, error: commit.error }
}

export async function gitLog(projectPath: string, count = 20): Promise<GitCommit[]> {
  try {
    const raw = run(projectPath, ['log', '-n', String(count), '--pretty=format:%H|%ad|%s|%an', '--date=short'])
    return raw.split('\n').filter(Boolean).map((line) => {
      const [hash, date, ...rest] = line.split('|')
      const author = rest.pop() || ''
      const message = rest.join('|')
      return { hash, date, message, author }
    })
  } catch {
    return []
  }
}

export async function gitDiff(projectPath: string, filePath?: string): Promise<GitDiff[]> {
  try {
    const args = filePath ? ['diff', '--', filePath] : ['diff']
    const raw = run(projectPath, args)
    if (!raw.trim()) return []
    const blocks: GitDiff[] = []
    let currentPath = ''
    let currentDiff = ''
    for (const line of raw.split('\n')) {
      if (line.startsWith('diff --git')) {
        if (currentPath) blocks.push({ path: currentPath, diff: currentDiff.trim() })
        const match = line.match(/diff --git a\/.+ b\/(.+)/)
        currentPath = match ? match[1] : line
        currentDiff = line + '\n'
      } else {
        currentDiff += line + '\n'
      }
    }
    if (currentPath) blocks.push({ path: currentPath, diff: currentDiff.trim() })
    return blocks
  } catch {
    return []
  }
}

export async function gitBranch(projectPath: string): Promise<GitBranch[]> {
  try {
    const raw = run(projectPath, ['branch', '-a'])
    return raw.split('\n').filter(Boolean).map((line) => ({
      name: line.replace(/^\*?\s+/, '').trim(),
      current: line.startsWith('*')
    }))
  } catch {
    return []
  }
}

export async function gitCheckout(projectPath: string, branch: string, create = false): Promise<GitResult> {
  const args = create ? ['checkout', '-b', branch] : ['checkout', branch]
  const res = runSafe(projectPath, args)
  return { ok: res.ok, output: res.output, error: res.error }
}

export async function gitPush(projectPath: string, remote = 'origin', branch?: string): Promise<GitResult> {
  const args = branch ? ['push', remote, branch] : ['push', remote]
  const res = runSafe(projectPath, args)
  return { ok: res.ok, output: res.output, error: res.error }
}

export async function gitPull(projectPath: string, remote = 'origin', branch?: string): Promise<GitResult> {
  const args = branch ? ['pull', remote, branch] : ['pull', remote]
  const res = runSafe(projectPath, args)
  return { ok: res.ok, output: res.output, error: res.error }
}

export async function gitRemote(projectPath: string): Promise<{ name: string; url: string }[]> {
  try {
    const raw = run(projectPath, ['remote', '-v'])
    const remotes = new Map<string, string>()
    for (const line of raw.split('\n').filter(Boolean)) {
      const parts = line.split(/\s+/)
      if (parts.length >= 2) remotes.set(parts[0], parts[1])
    }
    return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }))
  } catch {
    return []
  }
}

export async function gitAddRemote(projectPath: string, name: string, url: string): Promise<GitResult> {
  const res = runSafe(projectPath, ['remote', 'add', name, url])
  return { ok: res.ok, output: res.output, error: res.error }
}
