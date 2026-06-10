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

type DraftFixtureOptions = {
  artifactSha256?: string
  omitAssetNames?: string[]
  releaseIndexHandoff?: unknown
  releaseIndexHandoffSidecar?: unknown
  releaseEntry?: unknown
  requirePackOSReady?: boolean
  attestation?: unknown
  handoffAttestation?: unknown
  attestationSubjectName?: string
  attestationSubjectSha256?: string
  checksumsContent?: string
}

async function writeDraftFixture(root: string, options: DraftFixtureOptions = {}): Promise<string> {
  const artifactName = 'myaddon-0.1.0.echo-addon'
  const artifactContent = 'artifact-bytes'
  const artifactSha256 = options.artifactSha256 ?? sha256(artifactContent)
  const packageContent = JSON.stringify({ schemaVersion: 'echo.addon.package.v1' })
  const releaseContent = JSON.stringify({ schemaVersion: 'echo.release.index.entry.v1' })
  const checksumsContent = options.checksumsContent ?? [
    `${artifactSha256}  ${artifactName}`,
    `${sha256(packageContent)}  echo-addon-package.json`,
    `${sha256(releaseContent)}  echo-release.json`
  ].join('\n') + '\n'
  const fileContents = new Map<string, string>([
    [artifactName, artifactContent],
    ['checksums.sha256', checksumsContent],
    ['echo-addon-package.json', packageContent],
    ['echo-release.json', releaseContent],
    ['release-index-submission.md', '# Release Index Submission\n']
  ])
  const omitAssetNames = new Set(options.omitAssetNames ?? [])
  const assetRecords: Array<{ path: string; name: string; sha256: string }> = []
  for (const [name, content] of fileContents) {
    const assetPath = join(root, name)
    await fs.writeFile(assetPath, content)
    if (omitAssetNames.has(name)) continue
    assetRecords.push({
      path: assetPath,
      name,
      sha256: name === artifactName ? artifactSha256 : sha256(content)
    })
  }

  const checksumsAsset = assetRecords.find((asset) => asset.name === 'checksums.sha256')
  if (!checksumsAsset) throw new Error('Test fixture requires checksums.sha256 unless the test overrides handoff metadata.')
  const handoff = {
    schemaVersion: 'echo.release.index.handoff.v1',
    generatedAt: '2026-06-10T00:00:00.000Z',
    targetRepository: 'knoxhack/ECHO-Release-Index',
    targetCollection: 'addons',
    entryFileName: 'myaddon.json',
    entry: 'releaseEntry' in options ? options.releaseEntry : { id: 'myaddon', kind: 'addon', validation: 'warning' },
    sourceRepo: 'knoxhack/my-addon',
    releaseTag: 'v0.1.0',
    assets: [
      {
        name: artifactName,
        path: join(root, artifactName),
        sha256: artifactSha256,
        bytes: Buffer.byteLength(artifactContent),
        role: 'artifact'
      },
      {
        name: 'checksums.sha256',
        path: join(root, 'checksums.sha256'),
        sha256: checksumsAsset.sha256,
        bytes: Buffer.byteLength(checksumsContent),
        role: 'sidecar'
      },
      {
        name: 'echo-addon-package.json',
        path: join(root, 'echo-addon-package.json'),
        sha256: sha256(fileContents.get('echo-addon-package.json') ?? ''),
        bytes: Buffer.byteLength(fileContents.get('echo-addon-package.json') ?? ''),
        role: 'sidecar'
      },
      {
        name: 'echo-release.json',
        path: join(root, 'echo-release.json'),
        sha256: sha256(fileContents.get('echo-release.json') ?? ''),
        bytes: Buffer.byteLength(fileContents.get('echo-release.json') ?? ''),
        role: 'sidecar'
      }
    ],
    checksums: {
      file: 'checksums.sha256',
      sha256: checksumsAsset.sha256
    },
    attestation: 'handoffAttestation' in options ? options.handoffAttestation : {
      mode: 'required-for-official-or-verified',
      provider: 'github-artifact-attestations',
      requiredWorkflow: '.github/workflows/release.yml',
      requireDigestMatch: true,
      subjects: [
        {
          name: options.attestationSubjectName ?? artifactName,
          sha256: options.attestationSubjectSha256 ?? artifactSha256,
          bytes: Buffer.byteLength(artifactContent),
          sourceRepo: 'knoxhack/my-addon',
          releaseTag: 'v0.1.0'
        }
      ]
    },
    ingestion: {
      status: 'pending-review',
      requireSchemaValidation: true,
      requirePackOSReady: options.requirePackOSReady ?? true,
      notes: []
    }
  }
  const releaseIndexHandoff = 'releaseIndexHandoff' in options ? options.releaseIndexHandoff : handoff
  const handoffSidecar = 'releaseIndexHandoffSidecar' in options ? options.releaseIndexHandoffSidecar : releaseIndexHandoff
  const handoffContent = JSON.stringify(handoffSidecar, null, 2)
  const handoffPath = join(root, 'release-index-handoff.json')
  await fs.writeFile(handoffPath, handoffContent)
  if (!omitAssetNames.has('release-index-handoff.json')) {
    assetRecords.push({
      path: handoffPath,
      name: 'release-index-handoff.json',
      sha256: sha256(handoffContent)
    })
  }
  const attestation = 'attestation' in options ? options.attestation : handoff.attestation
  const draftPath = join(root, 'github-release-draft.json')
  await fs.writeFile(
    draftPath,
    JSON.stringify(
      {
        tag_name: 'v0.1.0',
        name: 'myaddon v0.1.0',
        draft: true,
        assets: assetRecords,
        releaseIndexHandoff,
        attestation
      },
      null,
      2
    )
  )
  return draftPath
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
      const draftPath = await writeDraftFixture(root)

      const fetchMock = vi.fn(() =>
        jsonResponse({
          url: 'https://github.com/knoxhack/my-addon/releases/tag/v0.1.0',
          assets: ['myaddon-0.1.0.echo-addon', 'release-index-handoff.json']
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
      expect(requestBody.releaseIndexHandoff.schemaVersion).toBe('echo.release.index.handoff.v1')
      expect(requestBody.releaseIndexHandoff.targetRepository).toBe('knoxhack/ECHO-Release-Index')
      expect(requestBody.attestation.provider).toBe('github-artifact-attestations')
      expect(requestBody.assets.map((asset: { name: string }) => asset.name)).toEqual(expect.arrayContaining([
        'myaddon-0.1.0.echo-addon',
        'checksums.sha256',
        'echo-addon-package.json',
        'echo-release.json',
        'release-index-handoff.json',
        'release-index-submission.md'
      ]))
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
      const draftPath = await writeDraftFixture(root, { artifactSha256: sha256('different-bytes') })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/SHA-256 mismatch/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts without Release Index handoff metadata', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, { releaseIndexHandoff: null })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/releaseIndexHandoff metadata/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts with rejected Release Index handoff entries', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, {
        releaseEntry: { id: 'myaddon', kind: 'addon', validation: 'rejected' }
      })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/handoff is rejected/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts whose handoff does not require PackOS-ready assets', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, { requirePackOSReady: false })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/PackOS-ready/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts without artifact attestation metadata', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, { attestation: null, handoffAttestation: null })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/attestation metadata/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts without the handoff sidecar asset', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, { omitAssetNames: ['release-index-handoff.json'] })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/release-index-handoff\.json/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts without the submission notes sidecar asset', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, { omitAssetNames: ['release-index-submission.md'] })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/release-index-submission\.md/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts whose handoff sidecar does not match embedded metadata', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, {
        releaseIndexHandoffSidecar: {
          schemaVersion: 'echo.release.index.handoff.v1',
          targetRepository: 'knoxhack/ECHO-Release-Index',
          targetCollection: 'addons',
          entryFileName: 'different.json'
        }
      })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/does not match/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts whose checksums sidecar does not cover handoff assets', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, {
        checksumsContent: `${sha256('artifact-bytes')}  myaddon-0.1.0.echo-addon\n`
      })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/checksums\.sha256 is missing a row for echo-addon-package\.json/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts whose checksums sidecar disagrees with draft metadata', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, {
        checksumsContent: [
          `${sha256('artifact-bytes')}  myaddon-0.1.0.echo-addon`,
          `${'a'.repeat(64)}  echo-addon-package.json`,
          `${sha256(JSON.stringify({ schemaVersion: 'echo.release.index.entry.v1' }))}  echo-release.json`
        ].join('\n') + '\n'
      })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/checksums\.sha256 row for echo-addon-package\.json/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects release drafts whose attestation subjects do not match uploaded artifacts', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'echo-publish-'))
    try {
      const draftPath = await writeDraftFixture(root, { attestationSubjectSha256: sha256('other-artifact') })

      await expect(createGitHubReleaseDraft(draftPath, 'knoxhack', 'my-addon')).rejects.toThrow(/attestation subject .* SHA-256/)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
