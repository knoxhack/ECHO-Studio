import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import AdmZip from 'adm-zip'

const require = createRequire(import.meta.url)
const root = process.cwd()
const electronRoot = path.join(root, 'node_modules', 'electron')
const pathTxt = path.join(electronRoot, 'path.txt')
const distPath = path.join(electronRoot, 'dist')
const installScript = path.join(electronRoot, 'install.js')
const packageJsonPath = path.join(electronRoot, 'package.json')
const repair = process.argv.includes('--repair')
const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || process.platform
const arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch
const platformPath = getPlatformPath()

function isHealthy() {
  try {
    const electronPackage = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const installedVersion = readFileSync(path.join(distPath, 'version'), 'utf8').trim().replace(/^v/, '')
    const installedPath = readFileSync(pathTxt, 'utf8')
    return (
      installedVersion === electronPackage.version &&
      installedPath === platformPath &&
      existsSync(path.join(distPath, platformPath))
    )
  } catch {
    return false
  }
}

async function repairFromVerifiedZip() {
  const electronPackage = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const checksums = require(path.join(electronRoot, 'checksums.json'))
  const { downloadArtifact } = require('@electron/get')
  const zipPath = await downloadArtifact({
    version: electronPackage.version,
    artifactName: 'electron',
    force: true,
    cacheRoot: process.env.electron_config_cache,
    checksums,
    platform,
    arch
  })

  rmSync(distPath, { recursive: true, force: true })
  new AdmZip(zipPath).extractAllTo(distPath, true)
  writeFileSync(pathTxt, platformPath)
}

if (isHealthy()) {
  console.log('Electron install looks healthy: node_modules/electron/path.txt and executable exist.')
  process.exit(0)
}

if (!existsSync(installScript)) {
  console.error('Electron package is not installed. Run npm ci, then retry npm run doctor:electron.')
  process.exit(1)
}

if (!repair) {
  console.error('Electron install is incomplete. Run npm run doctor:electron -- --repair to rerun Electron install.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [installScript], {
  cwd: root,
  stdio: 'inherit',
  env: process.env
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (!isHealthy()) {
  await repairFromVerifiedZip()
}

if (!isHealthy()) {
  console.error('Electron repair completed, but node_modules/electron is still incomplete.')
  process.exit(1)
}

console.log('Electron install repaired.')

function getPlatformPath() {
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`)
  }
}
