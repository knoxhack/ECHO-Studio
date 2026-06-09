import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectGitHubRepo,
  createGitHubReleaseDraft,
  getGitHubPublishingStatus,
  startGitHubAppLogin
} from '../../main/publishingService'

const ORIGINAL_ENV = { ...process.env }

async function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('GitHub App broker publishing', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    process.env.ECHO_GITHUB_APP_BROKER_URL = 'http://localhost:8787/'
    process.env.ECHO_GITHUB_APP_SESSION_TOKEN = 'test-session-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it('reports a ready GitHub App provider when broker session env is present', async () => {
    const status = await getGitHubPublishingStatus()

    expect(status.githubAppBrokerConfigured).toBe(true)
    expect(status.githubAppSessionReady).toBe(true)
    expect(status.activeProvider).toBe('github-app')
  })

  it('starts broker-backed GitHub App login', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=test',
        sessionId: 'session-1',
        message: 'Open GitHub to continue.'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const login = await startGitHubAppLogin()

    expect(login.authorizeUrl).toContain('github.com/login/oauth/authorize')
    expect(login.sessionId).toBe('session-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/github/login',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-session-token' })
      })
    )
  })

  it('connects repositories through the GitHub App broker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ exists: true, url: 'https://github.com/knoxhack/my-addon' }))
    )

    const connection = await connectGitHubRepo('knoxhack', 'my-addon')

    expect(connection.authProvider).toBe('github-app')
    expect(connection.authenticated).toBe(true)
    expect(connection.exists).toBe(true)
    expect(connection.url).toBe('https://github.com/knoxhack/my-addon')
  })

  it('uploads release draft payload and assets through the GitHub App broker', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const assetPath = join(root, 'myaddon-0.1.0.echo-addon')
      const draftPath = join(root, 'github-release-draft.json')
      await fs.writeFile(assetPath, 'artifact-bytes')
      await fs.writeFile(
        draftPath,
        JSON.stringify({
          tag_name: 'v0.1.0',
          name: 'myaddon v0.1.0',
          draft: true,
          assets: [{ path: assetPath, name: 'myaddon-0.1.0.echo-addon', sha256: sha256('artifact-bytes') }]
        })
      )

      const fetchMock = vi.fn(() =>
        jsonResponse({
          url: 'https://github.com/knoxhack/my-addon/releases/tag/v0.1.0',
          assets: ['myaddon-0.1.0.echo-addon']
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')
      const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const requestBody = JSON.parse(String(firstCall[1].body))

      expect(result.authProvider).toBe('github-app')
      expect(result.url).toContain('/releases/tag/v0.1.0')
      expect(requestBody.assets[0].contentBase64).toBe(Buffer.from('artifact-bytes').toString('base64'))
      expect(requestBody.releaseDraft.tag_name).toBe('v0.1.0')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts that reference assets outside the generated export folder', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const outsideAssetPath = join(root, '..', `outside-${Date.now()}.echo-addon`)
      const draftPath = join(root, 'github-release-draft.json')
      await fs.writeFile(outsideAssetPath, 'artifact-bytes')
      await fs.writeFile(
        draftPath,
        JSON.stringify({
          tag_name: 'v0.1.0',
          assets: [{ path: outsideAssetPath, name: 'outside.echo-addon', sha256: 'a'.repeat(64) }]
        })
      )

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/must stay inside/)
      await fs.rm(outsideAssetPath, { force: true })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release draft assets with unsafe names or invalid checksums', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const assetPath = join(root, 'myaddon-0.1.0.echo-addon')
      const draftPath = join(root, 'github-release-draft.json')
      await fs.writeFile(assetPath, 'artifact-bytes')
      await fs.writeFile(
        draftPath,
        JSON.stringify({
          tag_name: 'v0.1.0',
          assets: [{ path: assetPath, name: '../escape.echo-addon', sha256: 'not-a-sha' }]
        })
      )

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/asset name is unsafe/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release draft assets without SHA-256 hashes', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const assetPath = join(root, 'myaddon-0.1.0.echo-addon')
      const draftPath = join(root, 'github-release-draft.json')
      await fs.writeFile(assetPath, 'artifact-bytes')
      await fs.writeFile(
        draftPath,
        JSON.stringify({
          tag_name: 'v0.1.0',
          assets: [{ path: assetPath, name: 'myaddon-0.1.0.echo-addon' }]
        })
      )

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/valid SHA-256/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release draft assets whose bytes do not match declared SHA-256 hashes', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const assetPath = join(root, 'myaddon-0.1.0.echo-addon')
      const draftPath = join(root, 'github-release-draft.json')
      await fs.writeFile(assetPath, 'artifact-bytes')
      await fs.writeFile(
        draftPath,
        JSON.stringify({
          tag_name: 'v0.1.0',
          assets: [{ path: assetPath, name: 'myaddon-0.1.0.echo-addon', sha256: sha256('different-bytes') }]
        })
      )

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/SHA-256 mismatch/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
