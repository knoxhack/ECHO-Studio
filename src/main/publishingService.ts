import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { basename, dirname, resolve, sep } from 'path'
import { promisify } from 'util'
import type {
  GitHubAppLoginStart,
  GitHubAuthProvider,
  GitHubPublishingStatus,
  GitHubReleaseDraftResult,
  GitHubRepoConnection,
  ReleaseIndexHandoff
} from '../shared/publishing'

const execFileAsync = promisify(execFile)

type DraftAsset = {
  path: string
  name?: string
  sha256?: string
}

type ReleaseDraftFile = {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
  name?: string
  body?: string
  assets?: DraftAsset[]
  releaseIndexHandoff?: unknown
  attestation?: unknown
}

type ReleaseDraftMetadata = {
  releaseIndexHandoff: ReleaseIndexHandoff
  attestation: ReleaseIndexHandoff['attestation']
}

type BrokerRepoResponse = {
  exists?: boolean
  url?: string
  message?: string
}

type BrokerDraftResponse = {
  url?: string
  tag?: string
  draft?: boolean
  message?: string
  assets?: string[]
}

type BrokerLoginResponse = {
  authorizeUrl?: string
  installUrl?: string
  sessionId?: string
  message?: string
}

const SHA_256_RE = /^[a-f0-9]{64}$/i
const REQUIRED_RELEASE_DRAFT_SIDECARS = [
  'checksums.sha256',
  'echo-addon-package.json',
  'echo-release.json',
  'release-index-handoff.json',
  'release-index-submission.md'
] as const

function repoFullName(owner: string, repo: string): string {
  const cleanOwner = owner.trim()
  const cleanRepo = repo.trim()
  if (!/^[A-Za-z0-9_.-]+$/.test(cleanOwner) || !/^[A-Za-z0-9_.-]+$/.test(cleanRepo)) {
    throw new Error('GitHub owner and repo must be simple owner/repository names.')
  }
  return `${cleanOwner}/${cleanRepo}`
}

function assertGeneratedDraftPath(releaseDraftPath: string): string {
  const resolved = resolve(releaseDraftPath)
  if (basename(resolved) !== 'github-release-draft.json') {
    throw new Error('Release draft path must point to a generated github-release-draft.json file.')
  }
  return resolved
}

function assertInsideDirectory(parentDir: string, childPath: string): string {
  const resolvedParent = resolve(parentDir)
  const resolvedChild = resolve(childPath)
  if (resolvedChild !== resolvedParent && !resolvedChild.startsWith(`${resolvedParent}${sep}`)) {
    throw new Error(`Release draft asset must stay inside ${resolvedParent}.`)
  }
  return resolvedChild
}

function normalizeDraftAsset(asset: DraftAsset, draftDir: string): DraftAsset {
  const assetPath = assertInsideDirectory(draftDir, asset.path)
  const name = asset.name?.trim() || basename(assetPath)
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Release draft asset name is unsafe: ${name}`)
  }
  if (!asset.sha256 || !SHA_256_RE.test(asset.sha256)) {
    throw new Error(`Release draft asset ${name} must include a valid SHA-256 hash.`)
  }
  return { ...asset, path: assetPath, name }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assetName(asset: DraftAsset): string {
  return asset.name || basename(asset.path)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function requireSha256(value: unknown, message: string): string {
  const sha256 = requireString(value, message)
  if (!SHA_256_RE.test(sha256)) throw new Error(message)
  return sha256
}

function validateReleaseDraftMetadata(draft: ReleaseDraftFile, assets: DraftAsset[]): ReleaseDraftMetadata {
  const assetsByName = new Map(assets.map((asset) => [assetName(asset), asset]))
  for (const sidecar of REQUIRED_RELEASE_DRAFT_SIDECARS) {
    if (!assetsByName.has(sidecar)) {
      throw new Error(`Release draft is missing required sidecar asset ${sidecar}. Run Prepare Assets again.`)
    }
  }

  if (!isRecord(draft.releaseIndexHandoff)) {
    throw new Error('Release draft must include releaseIndexHandoff metadata. Run Prepare Assets again.')
  }
  const handoff = draft.releaseIndexHandoff
  if (handoff.schemaVersion !== 'echo.release.index.handoff.v1') {
    throw new Error('Release Index handoff schemaVersion must be echo.release.index.handoff.v1.')
  }
  if (handoff.targetRepository !== 'knoxhack/ECHO-Release-Index') {
    throw new Error('Release Index handoff targetRepository must be knoxhack/ECHO-Release-Index.')
  }
  if (handoff.targetCollection !== 'addons') {
    throw new Error('Release Index handoff targetCollection must be addons.')
  }
  const entryFileName = requireString(handoff.entryFileName, 'Release Index handoff entryFileName is required.')
  if (!/^[A-Za-z0-9._-]+\.json$/.test(entryFileName)) {
    throw new Error('Release Index handoff entryFileName must be a safe JSON file name.')
  }
  requireString(handoff.sourceRepo, 'Release Index handoff sourceRepo is required.')
  requireString(handoff.releaseTag, 'Release Index handoff releaseTag is required.')
  if (!isRecord(handoff.entry)) {
    throw new Error('Release Index handoff entry metadata is required.')
  }
  if (handoff.entry.validation === 'rejected') {
    throw new Error('Release Index handoff is rejected. Resolve PackOS, module, and release validation issues before creating a GitHub draft.')
  }
  if (!isRecord(handoff.ingestion) || handoff.ingestion.requirePackOSReady !== true) {
    throw new Error('Release Index handoff must require PackOS-ready assets before creating a GitHub draft.')
  }

  if (!Array.isArray(handoff.assets) || !handoff.assets.length) {
    throw new Error('Release Index handoff must list release assets.')
  }
  const handoffAssetsByName = new Map<string, Record<string, unknown>>()
  for (const handoffAsset of handoff.assets) {
    if (!isRecord(handoffAsset)) throw new Error('Release Index handoff contains an invalid asset record.')
    const name = requireString(handoffAsset.name, 'Release Index handoff asset name is required.')
    const sha256 = requireSha256(handoffAsset.sha256, `Release Index handoff asset ${name} must include a valid SHA-256 hash.`)
    const draftAsset = assetsByName.get(name)
    if (!draftAsset) throw new Error(`Release Index handoff asset ${name} is not included in release draft assets.`)
    if (draftAsset.sha256?.toLowerCase() !== sha256.toLowerCase()) {
      throw new Error(`Release Index handoff asset ${name} SHA-256 does not match release draft assets.`)
    }
    if (handoffAsset.role !== 'artifact' && handoffAsset.role !== 'sidecar') {
      throw new Error(`Release Index handoff asset ${name} must declare an artifact or sidecar role.`)
    }
    handoffAssetsByName.set(name, handoffAsset)
  }

  if (!isRecord(handoff.checksums)) throw new Error('Release Index handoff checksums metadata is required.')
  if (handoff.checksums.file !== 'checksums.sha256') {
    throw new Error('Release Index handoff checksums.file must be checksums.sha256.')
  }
  const checksumsSha256 = requireSha256(handoff.checksums.sha256, 'Release Index handoff checksums.sha256 must be a valid SHA-256 hash.')
  if (assetsByName.get('checksums.sha256')?.sha256?.toLowerCase() !== checksumsSha256.toLowerCase()) {
    throw new Error('Release Index handoff checksums.sha256 does not match the checksums.sha256 release asset.')
  }

  const attestation = draft.attestation ?? handoff.attestation
  if (!isRecord(attestation)) {
    throw new Error('Release draft must include GitHub artifact attestation metadata.')
  }
  if (attestation.provider !== 'github-artifact-attestations') {
    throw new Error('Release draft attestation provider must be github-artifact-attestations.')
  }
  if (attestation.requireDigestMatch !== true) {
    throw new Error('Release draft attestation must require digest matches.')
  }
  if (!Array.isArray(attestation.subjects) || !attestation.subjects.length) {
    throw new Error('Release draft attestation must include at least one subject.')
  }

  const attestedSubjectsByName = new Map<string, string>()
  for (const subject of attestation.subjects) {
    if (!isRecord(subject)) throw new Error('Release draft attestation contains an invalid subject.')
    const name = requireString(subject.name, 'Release draft attestation subject name is required.')
    const sha256 = requireSha256(subject.sha256, `Release draft attestation subject ${name} must include a valid SHA-256 hash.`)
    const draftAsset = assetsByName.get(name)
    if (!draftAsset) throw new Error(`Release draft attestation subject ${name} is not included in release draft assets.`)
    if (draftAsset.sha256?.toLowerCase() !== sha256.toLowerCase()) {
      throw new Error(`Release draft attestation subject ${name} SHA-256 does not match release draft assets.`)
    }
    if (handoffAssetsByName.get(name)?.role !== 'artifact') {
      throw new Error(`Release draft attestation subject ${name} must match a handoff artifact asset.`)
    }
    attestedSubjectsByName.set(name, sha256)
  }

  for (const handoffAsset of handoffAssetsByName.values()) {
    if (handoffAsset.role !== 'artifact') continue
    const name = String(handoffAsset.name)
    const sha256 = String(handoffAsset.sha256).toLowerCase()
    if (attestedSubjectsByName.get(name)?.toLowerCase() !== sha256) {
      throw new Error(`Release Index handoff artifact ${name} is missing a matching attestation subject.`)
    }
  }

  return {
    releaseIndexHandoff: handoff as unknown as ReleaseIndexHandoff,
    attestation: attestation as unknown as ReleaseIndexHandoff['attestation']
  }
}

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function parseChecksumRows(text: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i)
    if (!match) throw new Error(`checksums.sha256 contains an invalid row: ${line}`)
    const name = match[2].trim()
    if (rows.has(name)) throw new Error(`checksums.sha256 contains a duplicate row for ${name}.`)
    rows.set(name, match[1].toLowerCase())
  }
  return rows
}

async function readVerifiedDraftAsset(asset: DraftAsset): Promise<Buffer> {
  const buffer = await fs.readFile(asset.path)
  const actual = sha256Buffer(buffer)
  if (actual.toLowerCase() !== asset.sha256?.toLowerCase()) {
    throw new Error(`Release draft asset ${asset.name} SHA-256 mismatch.`)
  }
  return buffer
}

async function verifyReleaseIndexHandoffSidecar(handoff: ReleaseIndexHandoff, assets: DraftAsset[]): Promise<void> {
  const sidecar = assets.find((asset) => assetName(asset) === 'release-index-handoff.json')
  if (!sidecar) throw new Error('Release draft is missing required sidecar asset release-index-handoff.json.')
  const buffer = await readVerifiedDraftAsset(sidecar)
  let parsed: unknown
  try {
    parsed = JSON.parse(buffer.toString('utf-8'))
  } catch {
    throw new Error('release-index-handoff.json must contain valid JSON.')
  }
  if (stableJson(parsed) !== stableJson(handoff)) {
    throw new Error('release-index-handoff.json does not match the releaseIndexHandoff metadata embedded in github-release-draft.json.')
  }
}

async function verifyChecksumsSidecar(handoff: ReleaseIndexHandoff, assets: DraftAsset[]): Promise<void> {
  const checksumsAsset = assets.find((asset) => assetName(asset) === handoff.checksums.file)
  if (!checksumsAsset) throw new Error(`Release draft is missing required sidecar asset ${handoff.checksums.file}.`)
  const rows = parseChecksumRows((await readVerifiedDraftAsset(checksumsAsset)).toString('utf-8'))
  const assetsByName = new Map(assets.map((asset) => [assetName(asset), asset]))
  for (const handoffAsset of handoff.assets) {
    if (handoffAsset.name === handoff.checksums.file) continue
    const rowSha256 = rows.get(handoffAsset.name)
    if (!rowSha256) throw new Error(`checksums.sha256 is missing a row for ${handoffAsset.name}.`)
    const draftAsset = assetsByName.get(handoffAsset.name)
    if (!draftAsset) throw new Error(`Release draft is missing asset ${handoffAsset.name}.`)
    if (rowSha256 !== draftAsset.sha256?.toLowerCase()) {
      throw new Error(`checksums.sha256 row for ${handoffAsset.name} does not match release draft assets.`)
    }
    if (rowSha256 !== handoffAsset.sha256.toLowerCase()) {
      throw new Error(`checksums.sha256 row for ${handoffAsset.name} does not match Release Index handoff metadata.`)
    }
  }
}

async function runGh(args: string[]) {
  try {
    return await execFileAsync('gh', args, { windowsHide: true, maxBuffer: 1024 * 1024 * 4 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.includes('ENOENT') ? 'GitHub CLI (`gh`) is not installed or not on PATH.' : message)
  }
}

function githubAppInstallUrl(): string | undefined {
  const url = process.env.ECHO_GITHUB_APP_INSTALL_URL?.trim()
  return url && /^https:\/\/github\.com\/apps\/[A-Za-z0-9_.-]+\/installations\/new/i.test(url) ? url : undefined
}

function githubAppBrokerUrl(): string | undefined {
  const value = process.env.ECHO_GITHUB_APP_BROKER_URL?.trim()
  if (!value) return undefined
  try {
    const url = new URL(value)
    const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !isLocalHttp) return undefined
    url.pathname = url.pathname.replace(/\/+$/, '') + '/'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function githubAppSessionToken(): string | undefined {
  return process.env.ECHO_GITHUB_APP_SESSION_TOKEN?.trim() || undefined
}

function brokerEndpoint(path: string): string {
  const base = githubAppBrokerUrl()
  if (!base) throw new Error('GitHub App broker is not configured.')
  return new URL(path.replace(/^\/+/, ''), base).toString()
}

async function brokerRequest<T>(path: string, body?: unknown): Promise<T> {
  const token = githubAppSessionToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(brokerEndpoint(path), {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `GitHub App broker request failed with HTTP ${response.status}.`)
  }
  return (await response.json()) as T
}

async function ghCliAvailable(): Promise<boolean> {
  try {
    await runGh(['--version'])
    return true
  } catch {
    return false
  }
}

async function ghCliAuthenticated(): Promise<boolean> {
  try {
    await runGh(['auth', 'status'])
    return true
  } catch {
    return false
  }
}

export async function getGitHubPublishingStatus(): Promise<GitHubPublishingStatus> {
  const appInstallUrl = githubAppInstallUrl()
  const appBrokerUrl = githubAppBrokerUrl()
  const appSessionReady = Boolean(appBrokerUrl && githubAppSessionToken())
  const ghAvailable = await ghCliAvailable()
  const ghAuthenticated = ghAvailable ? await ghCliAuthenticated() : false
  const activeProvider: GitHubAuthProvider = appSessionReady ? 'github-app' : ghAuthenticated ? 'gh-cli' : appInstallUrl || appBrokerUrl ? 'github-app' : 'none'
  return {
    githubAppConfigured: Boolean(appInstallUrl || appBrokerUrl),
    githubAppInstallUrl: appInstallUrl,
    githubAppBrokerConfigured: Boolean(appBrokerUrl),
    githubAppBrokerUrl: appBrokerUrl,
    githubAppSessionReady: appSessionReady,
    ghCliAvailable: ghAvailable,
    ghCliAuthenticated: ghAuthenticated,
    activeProvider,
    message: appSessionReady
      ? 'GitHub App publishing broker is connected.'
      : ghAuthenticated
      ? 'GitHub CLI publishing is authenticated.'
      : appBrokerUrl
        ? 'GitHub App broker is configured. Start App login before publishing drafts.'
      : appInstallUrl
        ? 'GitHub App installation is configured. Install the app before publishing drafts.'
        : 'No GitHub publishing auth is available.',
  }
}

export async function startGitHubAppLogin(): Promise<GitHubAppLoginStart> {
  const brokerUrl = githubAppBrokerUrl()
  if (brokerUrl) {
    const response = await brokerRequest<BrokerLoginResponse>('v1/github/login', { client: 'echo-addons-studio' })
    return {
      authProvider: 'github-app',
      authorizeUrl: response.authorizeUrl,
      installUrl: response.installUrl,
      sessionId: response.sessionId,
      message: response.message || 'Open the GitHub App authorization link to finish login.',
    }
  }

  const installUrl = githubAppInstallUrl()
  if (!installUrl) throw new Error('GitHub App login is not configured.')
  return {
    authProvider: 'github-app',
    installUrl,
    message: 'Install the GitHub App, then restart Studio with a publishing session token.',
  }
}

export async function connectGitHubRepo(owner: string, repo: string): Promise<GitHubRepoConnection> {
  const fullName = repoFullName(owner, repo)
  const status = await getGitHubPublishingStatus()
  if (status.githubAppSessionReady) {
    try {
      const response = await brokerRequest<BrokerRepoResponse>('v1/github/repositories/connect', { owner, repo })
      return {
        owner,
        repo,
        authenticated: true,
        exists: response.exists !== false,
        authProvider: 'github-app',
        url: response.url,
        message: response.message || `Connected to ${fullName} with the GitHub App.`,
      }
    } catch (error) {
      return {
        owner,
        repo,
        authenticated: true,
        exists: false,
        authProvider: 'github-app',
        message: error instanceof Error ? error.message : `Unable to view ${fullName}.`,
      }
    }
  }

  if (!status.ghCliAuthenticated) {
    return {
      owner,
      repo,
      authenticated: false,
      exists: false,
      authProvider: status.activeProvider,
      message: status.message,
    }
  }

  try {
    const { stdout } = await runGh(['repo', 'view', fullName, '--json', 'url', '--jq', '.url'])
    return {
      owner,
      repo,
      authenticated: true,
      exists: true,
      authProvider: 'gh-cli',
      url: stdout.trim(),
      message: `Connected to ${fullName}.`,
    }
  } catch (error) {
    return {
      owner,
      repo,
      authenticated: true,
      exists: false,
      authProvider: 'gh-cli',
      message: error instanceof Error ? error.message : `Unable to view ${fullName}.`,
    }
  }
}

export async function createGitHubReleaseDraft(releaseDraftPath: string, owner: string, repo: string, tagOverride?: string, forceDraft = true): Promise<GitHubReleaseDraftResult> {
  const fullName = repoFullName(owner, repo)
  const draftPath = assertGeneratedDraftPath(releaseDraftPath)
  const draftDir = dirname(draftPath)
  const draft = JSON.parse(await fs.readFile(draftPath, 'utf-8')) as ReleaseDraftFile
  const tag = tagOverride?.trim() || draft.tag_name?.trim()
  if (!tag) throw new Error('Release tag is required.')
  const assets = (draft.assets ?? []).map((asset) => normalizeDraftAsset(asset, draftDir))
  if (!assets.length) throw new Error('Release draft has no assets.')
  const metadata = validateReleaseDraftMetadata(draft, assets)
  for (const asset of assets) {
    await fs.access(asset.path)
    await readVerifiedDraftAsset(asset)
  }
  await verifyReleaseIndexHandoffSidecar(metadata.releaseIndexHandoff, assets)
  await verifyChecksumsSidecar(metadata.releaseIndexHandoff, assets)

  const status = await getGitHubPublishingStatus()
  if (status.githubAppSessionReady) {
    const brokerAssets = await Promise.all(
      assets.map(async (asset) => {
        const buffer = await readVerifiedDraftAsset(asset)
        return {
          name: asset.name || asset.path.replace(/^.*[\\/]/, ''),
          path: asset.path,
          sha256: asset.sha256,
          contentBase64: buffer.toString('base64'),
        }
      })
    )
    const response = await brokerRequest<BrokerDraftResponse>('v1/github/releases/drafts', {
      owner,
      repo,
      tag,
      title: draft.name || tag,
      body: draft.body || '',
      draft: forceDraft || draft.draft !== false,
      prerelease: Boolean(draft.prerelease),
      releaseDraft: draft,
      releaseIndexHandoff: metadata.releaseIndexHandoff,
      attestation: metadata.attestation,
      assets: brokerAssets,
    })
    return {
      owner,
      repo,
      tag: response.tag || tag,
      draft: response.draft ?? (forceDraft || draft.draft !== false),
      url: response.url,
      assets: response.assets || assets.map((asset) => asset.path),
      authProvider: 'github-app',
    }
  }

  const args = [
    'release',
    'create',
    tag,
    ...assets.map((asset) => asset.path),
    '--repo',
    fullName,
    '--title',
    draft.name || tag,
    '--notes',
    draft.body || '',
  ]
  if (forceDraft || draft.draft !== false) args.push('--draft')
  if (draft.prerelease) args.push('--prerelease')

  await runGh(args)
  const url = `https://github.com/${fullName}/releases/tag/${encodeURIComponent(tag)}`
  return {
    owner,
    repo,
    tag,
    draft: forceDraft || draft.draft !== false,
    url,
    assets: assets.map((asset) => asset.path),
    command: ['gh', ...args],
    authProvider: 'gh-cli',
  }
}
