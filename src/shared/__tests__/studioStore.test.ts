import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { addRelease, getReleaseReview, getReleases, getSubmission, saveReleaseReview, saveSubmission } from '../../main/studioStore'
import type { ReleaseEntry, ReleaseReviewState } from '../publishing'

describe('studioStore', () => {
  it('reads legacy .studio submission state and writes normalized .echo-studio release review state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-studio-store-'))
    try {
      await fs.mkdir(path.join(root, '.studio'), { recursive: true })
      await fs.writeFile(
        path.join(root, '.studio', 'submission.json'),
        JSON.stringify({
          target: 'Community Catalog',
          description: 'legacy review',
          changelog: '',
          screenshots: [],
          permissionsConfirmed: true,
          status: 'draft',
          thread: []
        } satisfies ReleaseReviewState),
        'utf8'
      )

      const legacy = await getReleaseReview(root)
      expect(legacy.target).toBe('Release Index Ingestion')
      expect(legacy.description).toBe('legacy review')

      await saveReleaseReview(root, {
        ...legacy,
        target: 'Verified Addon Review',
        description: 'modern review'
      })
      const modern = JSON.parse(await fs.readFile(path.join(root, '.echo-studio', 'release-review.json'), 'utf8'))
      expect(modern.target).toBe('Verified Release Review')
      expect(modern.description).toBe('modern review')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('keeps legacy submission helpers wired to release review state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-studio-store-'))
    try {
      await saveSubmission(root, {
        target: 'Private Unlisted Share',
        description: 'compat review',
        changelog: '',
        screenshots: [],
        permissionsConfirmed: true,
        status: 'draft',
        thread: []
      })

      const review = await getSubmission(root)
      expect(review.target).toBe('Private Draft Release')
      expect(review.description).toBe('compat review')
      await expect(fs.readFile(path.join(root, '.echo-studio', 'release-review.json'), 'utf8')).resolves.toContain('compat review')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('migrates release history reads to .echo-studio writes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-studio-store-'))
    try {
      const first: ReleaseEntry = {
        version: '0.1.0',
        channel: 'alpha',
        hash: 'a'.repeat(64),
        zipPath: 'exports/first.echo-addon',
        notes: 'legacy release',
        at: 1
      }
      const second: ReleaseEntry = {
        version: '0.2.0',
        channel: 'alpha',
        hash: 'b'.repeat(64),
        zipPath: 'exports/second.echo-addon',
        notes: 'modern release',
        at: 2
      }
      await fs.mkdir(path.join(root, '.studio'), { recursive: true })
      await fs.writeFile(path.join(root, '.studio', 'releases.json'), JSON.stringify({ releases: [first] }), 'utf8')

      expect((await getReleases(root)).releases).toEqual([first])
      await addRelease(root, second)

      const modern = JSON.parse(await fs.readFile(path.join(root, '.echo-studio', 'releases.json'), 'utf8'))
      expect(modern.releases).toEqual([second, first])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
