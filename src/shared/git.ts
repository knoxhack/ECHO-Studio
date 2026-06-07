export interface GitStatus {
  isRepo: boolean
  branch: string
  ahead: number
  behind: number
  files: { path: string; status: string }[]
}

export interface GitCommit {
  hash: string
  date: string
  message: string
  author: string
}

export interface GitDiff {
  path: string
  diff: string
}

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitResult {
  ok: boolean
  output?: string
  error?: string
}
