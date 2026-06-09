import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const pathTxt = path.join(root, 'node_modules', 'electron', 'path.txt')
const installScript = path.join(root, 'node_modules', 'electron', 'install.js')
const repair = process.argv.includes('--repair')

if (existsSync(pathTxt)) {
  console.log('Electron install looks healthy: node_modules/electron/path.txt exists.')
  process.exit(0)
}

if (!existsSync(installScript)) {
  console.error('Electron package is not installed. Run npm ci, then retry npm run doctor:electron.')
  process.exit(1)
}

if (!repair) {
  console.error('Electron path.txt is missing. Run npm run doctor:electron -- --repair to rerun Electron install.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [installScript], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (!existsSync(pathTxt)) {
  console.error('Electron install completed, but node_modules/electron/path.txt is still missing.')
  process.exit(1)
}

console.log('Electron install repaired.')
