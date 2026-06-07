import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpc } from './ipc'

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
function setupAutoUpdater(mainWindow: BrowserWindow): void {
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

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-status', { status: 'error', message: err.message })
  })

  // Allow renderer to trigger install-and-restart.
  ipcMain.on('update:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createSplash()
  createWindow()

  // Check for updates in production builds (skip in dev).
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (mainWindow && !process.env['ELECTRON_RENDERER_URL']) {
    setupAutoUpdater(mainWindow)
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error('[autoUpdater]', err.message)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
