import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpc } from './ipc'

const UPDATE_DISABLED = process.env['UPDATE_DISABLED'] === 'true'
const UPDATE_MANUAL_URL = 'https://github.com/knoxhack/ECHO-Addons-Studio/releases'

// Track splash window reference so we can close it.
let splashWindow: BrowserWindow | null = null

function getConfiguredUpdateChannel(): string | undefined {
  const configured = process.env['ECHO_UPDATE_CHANNEL'] || process.env['APP_UPDATE_CHANNEL']
  if (configured === 'beta' || configured === 'stable') {
    return configured
  }

  const version = app.getVersion()
  if (version.includes('-beta.')) {
    return 'beta'
  }

  return 'stable'
}

function formatManualInstallMessage(channel: string, error: string): { status: string; message: string; manualUrl: string } {
  return {
    status: 'manual-fallback',
    message: `Update check failed for ${channel} channel: ${error}`,
    manualUrl: UPDATE_MANUAL_URL,
  }
}

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
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  splashWindow.loadFile(join(__dirname, '../../build/splash.html'), {
    query: { v: app.getVersion() },
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
    title: 'ECHO Addon Studio',
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ---- Auto Updater Events ----
function setupAutoUpdater(mainWindow: BrowserWindow): void {
  if (UPDATE_DISABLED) {
    mainWindow.webContents.send('update-status', { status: 'disabled' })
    return
  }

  const channel = getConfiguredUpdateChannel()
  if (channel) {
    autoUpdater.channel = channel
  }
  autoUpdater.autoDownload = true

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
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-status', formatManualInstallMessage(channel ?? 'stable', err.message))
    console.error('[autoUpdater][error]', err)
  })

  ipcMain.on('update:install', () => {
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mainWindow.webContents.send('update-status', formatManualInstallMessage(channel ?? 'stable', message))
    }
  })

  autoUpdater.checkForUpdates().catch((error) => {
    mainWindow.webContents.send('update-status', formatManualInstallMessage(channel ?? 'stable', error.message))
    console.error('[autoUpdater][check]', error)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createSplash()
  const mainWindow = createWindow()

  if (mainWindow && !process.env['ELECTRON_RENDERER_URL']) {
    setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
