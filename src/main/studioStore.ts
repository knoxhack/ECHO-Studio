import { promises as fs } from 'fs'
import { join } from 'path'
import type { ReleaseEntry, ReleasesState, SubmissionState } from '../shared/publishing'

// Per-project state stored under <project>/.studio/.

async function readJson<T>(projectPath: string, file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(join(projectPath, '.studio', file), 'utf-8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(projectPath: string, file: string, data: unknown): Promise<void> {
  const dir = join(projectPath, '.studio')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, file), JSON.stringify(data, null, 2), 'utf-8')
}

const DEFAULT_SUBMISSION: SubmissionState = {
  target: 'Community Catalog',
  description: '',
  changelog: '',
  screenshots: [],
  permissionsConfirmed: false,
  status: 'draft',
  thread: []
}

export function getSubmission(projectPath: string): Promise<SubmissionState> {
  return readJson(projectPath, 'submission.json', DEFAULT_SUBMISSION)
}
export function saveSubmission(projectPath: string, state: SubmissionState): Promise<void> {
  return writeJson(projectPath, 'submission.json', state)
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
