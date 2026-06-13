import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import https from 'https'
import { autoUpdater } from 'electron-updater'
import { registerIpc } from './ipc'
import { selectIndexedProductUpdate, type IndexedProductUpdate, type ReleaseIndexProductEntry } from '../shared/productUpdateIndex'

const UPDATE_FEED_OWNER_PUBLIC = 'knoxhack'
const UPDATE_FEED_REPO_PUBLIC = 'ECHO-Studio'
const UPDATE_FEED_STREAM = 'public'
const RELEASE_INDEX_CHANNEL_URL =
  process.env['ECHO_RELEASE_INDEX_CHANNEL_URL'] ||
  'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json'
const RELEASE_INDEX_PRODUCT_ID = 'echo-addons-studio'

type ReleaseIndexChannel = { catalogUrls?: string[] | Record<string, string[]> }

function configureUserDataPath(): void {
  const override = process.env['ECHO_STUDIO_USER_DATA_DIR']
  if (override) {
    app.setPath('userData', override)
    return
  }
  if (!app.isPackaged) {
    app.setPath('userData', join(app.getPath('temp'), 'ECHO Studio Dev'))
  }
}

configureUserDataPath()

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

async function resolveReleaseIndexProductFeed(): Promise<IndexedProductUpdate | null> {
  const channel = await readHttpsJson<ReleaseIndexChannel>(RELEASE_INDEX_CHANNEL_URL)
  const catalogUrls = Array.isArray(channel.catalogUrls)
    ? channel.catalogUrls
    : Object.values(channel.catalogUrls ?? {}).flat()
  for (const catalogUrl of catalogUrls) {
    const entry = await readHttpsJson<ReleaseIndexProductEntry>(catalogUrl)
    if (entry.id !== RELEASE_INDEX_PRODUCT_ID) continue
    const update = selectIndexedProductUpdate(entry, RELEASE_INDEX_PRODUCT_ID)
    assertUpdateFeedConfig(resolveUpdateStream(), update.feed)
    return update
  }
  return null
}

function assertUpdateFeedConfig(stream: 'public' | 'internal', feed: { owner: string; repo: string }): void {
  if (stream !== UPDATE_FEED_STREAM || feed.owner !== UPDATE_FEED_OWNER_PUBLIC || feed.repo !== UPDATE_FEED_REPO_PUBLIC) {
    throw new Error(`Invalid ECHO Studio updater feed: ${feed.owner}/${feed.repo}.`)
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

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0e14',
    title: 'ECHO Studio',
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

  return mainWindow
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
        artifacts: {
          latestYml: {
            name: canonical.artifacts.latestYml.name,
            sha256: canonical.artifacts.latestYml.sha256
          },
          installer: {
            name: canonical.artifacts.installer.name,
            sha256: canonical.artifacts.installer.sha256
          },
          blockmap: canonical.artifacts.blockmap
            ? {
                name: canonical.artifacts.blockmap.name,
                sha256: canonical.artifacts.blockmap.sha256
              }
            : undefined
        },
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
  const mainWindow = createWindow()

  // Check for updates in production builds (skip in dev).
  if (!process.env['ELECTRON_RENDERER_URL']) {
    void setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
