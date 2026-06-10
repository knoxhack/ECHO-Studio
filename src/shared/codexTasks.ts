import type { DevSetupResult } from './devWorkspace'
import type { PackageResult } from './publishing'

export type CodexTaskLane = 'suggested' | 'waiting_review' | 'ready' | 'rejected'

export type CodexTaskKind =
  | 'manifest_fix'
  | 'module_closure'
  | 'module_catalog_setup'
  | 'localization_fix'
  | 'mission_reward_fix'
  | 'index_entry_fix'
  | 'holomap_marker_fix'
  | 'dev_workspace_setup'
  | 'runtime_preview_setup'
  | 'release_package'
  | 'navigation'

export interface CodexTaskValidationSnapshot {
  blockers: number
  errors: number
  warnings: number
  suggestions: number
  publishingReady: boolean
}

export interface CodexTaskFileChange {
  path: string
  before?: string
  after?: string
  diff?: string
}

export interface CodexTask {
  id: string
  title: string
  kind: CodexTaskKind
  lane: CodexTaskLane
  summary: string
  reason: string
  route: string
  affectedFiles: string[]
  fileChanges: CodexTaskFileChange[]
  canApply: boolean
  applyLabel?: string
  rejectable: boolean
  validationBefore?: CodexTaskValidationSnapshot
  validationAfter?: CodexTaskValidationSnapshot
}

export interface CodexTaskActionResult {
  taskId: string
  message: string
  filesChanged: string[]
  packageResult?: PackageResult
  devSetup?: DevSetupResult
}

export function validationSnapshot(report: {
  counts: { BLOCKER: number; ERROR: number; WARNING: number; SUGGESTION: number }
  publishingReady: boolean
}): CodexTaskValidationSnapshot {
  return {
    blockers: report.counts.BLOCKER,
    errors: report.counts.ERROR,
    warnings: report.counts.WARNING,
    suggestions: report.counts.SUGGESTION,
    publishingReady: report.publishingReady
  }
}

export function jsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function buildUnifiedTextDiff(path: string, before: string, after: string): string {
  if (before === after) return ''
  const beforeLines = before.replace(/\r\n/g, '\n').split('\n')
  const afterLines = after.replace(/\r\n/g, '\n').split('\n')
  const out = [`--- a/${path}`, `+++ b/${path}`, '@@']
  const max = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < max; i++) {
    const oldLine = beforeLines[i]
    const newLine = afterLines[i]
    if (oldLine === newLine) {
      if (oldLine !== undefined) out.push(` ${oldLine}`)
      continue
    }
    if (oldLine !== undefined) out.push(`-${oldLine}`)
    if (newLine !== undefined) out.push(`+${newLine}`)
  }
  return out.join('\n')
}
