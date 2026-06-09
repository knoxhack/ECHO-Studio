import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { basename, dirname, resolve, sep } from 'path'
import { promisify } from 'util'
import type {
  GitHubAppLoginStart,
  GitHubAuthProvider,
  GitHubPublishingStatus,
  GitHubReleaseDraftResult,
  GitHubRepoConnection
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
  if (asset.sha256 && !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
    throw new Error(`Release draft asset ${name} has an invalid SHA-256 hash.`)
  }
  return { ...asset, path: assetPath, name }
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
  for (const asset of assets) {
    await fs.access(asset.path)
  }

  const status = await getGitHubPublishingStatus()
  if (status.githubAppSessionReady) {
    const brokerAssets = await Promise.all(
      assets.map(async (asset) => ({
        name: asset.name || asset.path.replace(/^.*[\\/]/, ''),
        path: asset.path,
        sha256: asset.sha256,
        contentBase64: (await fs.readFile(asset.path)).toString('base64'),
      }))
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
