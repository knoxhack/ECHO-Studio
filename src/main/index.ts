import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import https from 'https'
import { autoUpdater } from 'electron-updater'
import { registerIpc } from './ipc'

const UPDATE_FEED_OWNER_PUBLIC = 'knoxhack'
const UPDATE_FEED_REPO_PUBLIC = 'ECHO-Addons-Studio'
const UPDATE_FEED_STREAM = 'public'
const RELEASE_INDEX_CHANNEL_URL =
  process.env['ECHO_RELEASE_INDEX_CHANNEL_URL'] ||
  'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json'
const RELEASE_INDEX_PRODUCT_ID = 'echo-addons-studio'

type ReleaseIndexProductEntry = {
  id?: string
  kind?: string
  version?: string
  sourceRepo?: string
  compatibility?: string[]
  validation?: string
  artifacts?: unknown
}
type ReleaseIndexChannel = { catalogUrls?: string[] | Record<string, string[]> }

function resolveUpdateStream(): 'public' | 'internal' {
  return UPDATE_FEED_STREAM
}

function isUpdateDisabled(): boolean {
  const disable = process.env['ECHO_UPDATES_DISABLED'] || process.env['UPDATE_DISABLED']
  return disable === '1' || (disable || '').toLowerCase() === 'true'
}

function isPrereleaseVersion(value: string): boolean {
  return /-\w/.test(value)
}

function buildFeedReleasePage(feed: { owner: string; repo: string }): string {
  return `https://github.com/${feed.owner}/${feed.repo}/releases`
}

function resolveUpdateFeedConfig() {
  const stream = resolveUpdateStream()
  const feed = {
    owner: UPDATE_FEED_OWNER_PUBLIC,
    repo: UPDATE_FEED_REPO_PUBLIC
  }
  assertUpdateFeedConfig(stream, feed)
  return feed
}

function readHttpsJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { accept: 'application/json', 'user-agent': 'echo-addons-studio' } }, (response) => {
        const statusCode = response.statusCode ?? 0
        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Release Index request failed with HTTP ${statusCode}: ${url}`))
          return
        }
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T)
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })
}

function hasUpdaterArtifact(entry: ReleaseIndexProductEntry): boolean {
  const visit = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(visit)
    if (!node || typeof node !== 'object') return false
    const row = node as Record<string, unknown>
    if ((row.url || row.downloadUrl) && (row.sha256 || row.sha512) && (row.file || row.name || row.filename)) return true
    return Object.values(row).some(visit)
  }
  return visit(entry.artifacts)
}

async function resolveReleaseIndexProductFeed(): Promise<{ feed: { owner: string; repo: string }; entry: ReleaseIndexProductEntry } | null> {
  const channel = await readHttpsJson<ReleaseIndexChannel>(RELEASE_INDEX_CHANNEL_URL)
  const catalogUrls = Array.isArray(channel.catalogUrls)
    ? channel.catalogUrls
    : Object.values(channel.catalogUrls ?? {}).flat()
  for (const catalogUrl of catalogUrls) {
    const entry = await readHttpsJson<ReleaseIndexProductEntry>(catalogUrl)
    if (entry.id !== RELEASE_INDEX_PRODUCT_ID) continue
    if (entry.validation !== 'approved') throw new Error(`Release Index product ${RELEASE_INDEX_PRODUCT_ID} is ${entry.validation ?? 'missing validation'}.`)
    if (!hasUpdaterArtifact(entry)) throw new Error(`Release Index product ${RELEASE_INDEX_PRODUCT_ID} has no updater artifact.`)
    const sourceRepo = String(entry.sourceRepo ?? '')
    const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(sourceRepo)
    if (!match) throw new Error(`Release Index product ${RELEASE_INDEX_PRODUCT_ID} has invalid sourceRepo.`)
    const feed = { owner: match[1], repo: match[2] }
    assertUpdateFeedConfig(resolveUpdateStream(), feed)
    return { feed, entry }
  }
  return null
}

function assertUpdateFeedConfig(stream: 'public' | 'internal', feed: { owner: string; repo: string }): void {
  if (stream !== UPDATE_FEED_STREAM || feed.owner !== UPDATE_FEED_OWNER_PUBLIC || feed.repo !== UPDATE_FEED_REPO_PUBLIC) {
    throw new Error(`Invalid ECHO Addon Studio updater feed: ${feed.owner}/${feed.repo}.`)
  }
}

function resolveUpdateFeedTag(): string {
  if (process.env['ECHO_UPDATE_CHANNEL']) {
    return process.env['ECHO_UPDATE_CHANNEL']
  }
  return isPrereleaseVersion(app.getVersion()) ? 'beta' : 'stable'
}

// Track splash window reference so we can close it.
let splashWindow: BrowserWindow | null = null

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 280,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  splashWindow.loadFile(join(__dirname, '../../build/splash.html'), {
    query: { v: app.getVersion() }
  })

  splashWindow.on('ready-to-show', () => splashWindow?.show())
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0e14',
    title: 'ECHO Addon Studio',
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Destroy splash before showing main window for a clean transition.
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close()
      splashWindow = null
    }
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects this env var in dev; fall back to built file otherwise.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---- Auto Updater Events ----
async function setupAutoUpdater(mainWindow: BrowserWindow): Promise<void> {
  if (isUpdateDisabled()) {
    mainWindow.webContents.send('update-status', { status: 'disabled', message: 'Update checks are disabled by policy.' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = isPrereleaseVersion(app.getVersion()) || (process.env['ECHO_UPDATE_ALLOW_PRERELEASE'] || '').toLowerCase() === 'true'
  autoUpdater.channel = resolveUpdateFeedTag()
  let primaryFeed = resolveUpdateFeedConfig()
  try {
    const canonical = await resolveReleaseIndexProductFeed()
    if (canonical) {
      primaryFeed = canonical.feed
      mainWindow.webContents.send('update-status', {
        status: 'release-index-product',
        productId: RELEASE_INDEX_PRODUCT_ID,
        version: canonical.entry.version,
        sourceRepo: canonical.entry.sourceRepo,
      })
    } else {
      mainWindow.webContents.send('update-status', {
        status: 'release-index-product-missing',
        productId: RELEASE_INDEX_PRODUCT_ID,
        message: 'Release Index product entry was not found; using compatibility updater feed.',
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    mainWindow.webContents.send('update-status', {
      status: 'release-index-product-warning',
      productId: RELEASE_INDEX_PRODUCT_ID,
      message: `${message} Using compatibility updater feed.`,
    })
  }
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: primaryFeed.owner,
    repo: primaryFeed.repo,
    releaseType: 'release'
  })

  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-status', { status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-status', { status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (_err) => {
    mainWindow.webContents.send('update-status', {
      status: 'error',
      message: `Could not contact ${primaryFeed.owner}/${primaryFeed.repo}. Open manual install flow.`,
      manualInstallUrl: buildFeedReleasePage(primaryFeed)
    })
  })

  // Allow renderer to trigger install-and-restart.
  ipcMain.on('update:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  void autoUpdater.checkForUpdatesAndNotify()
}

app.whenReady().then(() => {
  registerIpc()
  createSplash()
  createWindow()

  // Check for updates in production builds (skip in dev).
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (mainWindow && !process.env['ELECTRON_RENDERER_URL']) {
    void setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
