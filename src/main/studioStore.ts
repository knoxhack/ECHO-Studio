import { promises as fs } from 'fs'
import { join } from 'path'
import { RELEASE_REVIEW_TARGETS } from '../shared/publishing'
import type { ReleaseEntry, ReleasesState, ReleaseReviewState } from '../shared/publishing'

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
  return readFirstJson(projectPath, [file], fallback)
}

async function readFirstJson<T>(projectPath: string, files: string[], fallback: T): Promise<T> {
  for (const dir of [STUDIO_DIR, LEGACY_STUDIO_DIR]) {
    for (const file of files) {
      try {
        return JSON.parse(await fs.readFile(join(projectPath, dir, file), 'utf-8')) as T
      } catch {
        // Try the next state file before falling back.
      }
    }
  }
  return fallback
}

async function writeJson(projectPath: string, file: string, data: unknown): Promise<void> {
  const dir = join(projectPath, STUDIO_DIR)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, file), JSON.stringify(data, null, 2), 'utf-8')
}

const RELEASE_REVIEW_FILE = 'release-review.json'
const LEGACY_SUBMISSION_FILE = 'submission.json'

const DEFAULT_RELEASE_REVIEW: ReleaseReviewState = {
  target: RELEASE_REVIEW_TARGETS[0],
  description: '',
  changelog: '',
  screenshots: [],
  permissionsConfirmed: false,
  status: 'draft',
  thread: []
}

function normalizeReleaseReview(state: ReleaseReviewState): ReleaseReviewState {
  const migratedTarget = LEGACY_TARGETS[state.target] ?? state.target
  const target = (RELEASE_REVIEW_TARGETS as readonly string[]).includes(migratedTarget)
    ? migratedTarget
    : RELEASE_REVIEW_TARGETS[0]
  return {
    ...state,
    target
  }
}

export async function getReleaseReview(projectPath: string): Promise<ReleaseReviewState> {
  return normalizeReleaseReview(
    await readFirstJson(projectPath, [RELEASE_REVIEW_FILE, LEGACY_SUBMISSION_FILE], DEFAULT_RELEASE_REVIEW)
  )
}

export function saveReleaseReview(projectPath: string, state: ReleaseReviewState): Promise<void> {
  return writeJson(projectPath, RELEASE_REVIEW_FILE, normalizeReleaseReview(state))
}

/** @deprecated Use getReleaseReview. Kept for legacy IPC callers. */
export const getSubmission = getReleaseReview

/** @deprecated Use saveReleaseReview. Kept for legacy IPC callers. */
export const saveSubmission = saveReleaseReview

export function getReleases(projectPath: string): Promise<ReleasesState> {
  return readJson(projectPath, 'releases.json', { releases: [] })
}
export async function addRelease(projectPath: string, entry: ReleaseEntry): Promise<ReleasesState> {
  const cur = await getReleases(projectPath)
  cur.releases.unshift(entry)
  await writeJson(projectPath, 'releases.json', cur)
  return cur
}
