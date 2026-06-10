import { promises as fs } from 'fs'
import { join } from 'path'
import { RELEASE_SUBMISSION_TARGETS } from '../shared/publishing'
import type { ReleaseEntry, ReleasesState, SubmissionState } from '../shared/publishing'

// Per-project Studio state is written under <project>/.echo-studio/.
// Legacy .studio files are still readable so older projects keep their review history.

const STUDIO_DIR = '.echo-studio'
const LEGACY_STUDIO_DIR = '.studio'

const LEGACY_TARGETS: Record<string, string> = {
  'Community Catalog': 'Release Index Ingestion',
  'Verified Addon Review': 'Verified Release Review',
  'Private Unlisted Share': 'Private Draft Release',
  'Server Pack Submission': 'Server Pack Handoff'
}

async function readJson<T>(projectPath: string, file: string, fallback: T): Promise<T> {
  for (const dir of [STUDIO_DIR, LEGACY_STUDIO_DIR]) {
    try {
      return JSON.parse(await fs.readFile(join(projectPath, dir, file), 'utf-8')) as T
    } catch {
      // Try the next state directory before falling back.
    }
  }
  return fallback
}

async function writeJson(projectPath: string, file: string, data: unknown): Promise<void> {
  const dir = join(projectPath, STUDIO_DIR)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, file), JSON.stringify(data, null, 2), 'utf-8')
}

const DEFAULT_SUBMISSION: SubmissionState = {
  target: RELEASE_SUBMISSION_TARGETS[0],
  description: '',
  changelog: '',
  screenshots: [],
  permissionsConfirmed: false,
  status: 'draft',
  thread: []
}

function normalizeSubmission(state: SubmissionState): SubmissionState {
  const migratedTarget = LEGACY_TARGETS[state.target] ?? state.target
  const target = (RELEASE_SUBMISSION_TARGETS as readonly string[]).includes(migratedTarget)
    ? migratedTarget
    : RELEASE_SUBMISSION_TARGETS[0]
  return {
    ...state,
    target
  }
}

export async function getSubmission(projectPath: string): Promise<SubmissionState> {
  return normalizeSubmission(await readJson(projectPath, 'submission.json', DEFAULT_SUBMISSION))
}
export function saveSubmission(projectPath: string, state: SubmissionState): Promise<void> {
  return writeJson(projectPath, 'submission.json', normalizeSubmission(state))
}

export function getReleases(projectPath: string): Promise<ReleasesState> {
  return readJson(projectPath, 'releases.json', { releases: [] })
}
export async function addRelease(projectPath: string, entry: ReleaseEntry): Promise<ReleasesState> {
  const cur = await getReleases(projectPath)
  cur.releases.unshift(entry)
  await writeJson(projectPath, 'releases.json', cur)
  return cur
}
