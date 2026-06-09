import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { readManifest, listAssetFiles } from './fsService'
import { readAllContent, readLangKeys } from './contentService'
import { runProjectCheck } from '../shared/projectValidation'
import { buildAddonPackageManifest } from '../shared/templates'
import { validateAddonPackageManifest } from '../shared/addonPackageContract'
import type { PackOSReport } from '../shared/types'
import type { PackageResult } from '../shared/publishing'
import type { AddonPackageManifest, AddonPackageTarget } from '../shared/addonPackageContract'

const EXCLUDE_DIRS = new Set(['.studio', 'exports', 'node_modules', '.git'])
const TARGET_COMPATIBILITY: Record<AddonPackageTarget, string> = {
  native: 'ashfall-native-edition',
  neoforge: 'ashfall-neoforge-edition',
  standalone: 'ashfall-standalone-edition'
}

function localId(id: string): string {
  return id.includes(':') ? id.split(':')[1] : id
}

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function zipEntryIsDirectory(entry: { isDirectory?: boolean | (() => boolean) }): boolean {
  return typeof entry.isDirectory === 'function' ? entry.isDirectory() : Boolean(entry.isDirectory)
}

function addProjectFiles(zip: AdmZip, projectPath: string, entries: Dirent[]): void {
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue
    const full = join(projectPath, e.name)
    if (e.isDirectory()) zip.addLocalFolder(full, e.name)
    else zip.addLocalFile(full)
  }
}

function addCommonMetadata(zip: AdmZip, manifest: unknown, packageManifest: unknown, report: PackOSReport): void {
  zip.addFile('META-INF/echo.mod.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'))
  zip.addFile('echo-addon-package.json', Buffer.from(JSON.stringify(packageManifest, null, 2), 'utf-8'))
  zip.addFile('packos.report.json', Buffer.from(JSON.stringify(report, null, 2), 'utf-8'))
}

function addChecksums(zip: AdmZip): void {
  const checksums = zip
    .getEntries()
    .filter((entry) => !zipEntryIsDirectory(entry) && entry.entryName !== 'checksums.sha256')
    .map((entry) => `${sha256Buffer(entry.getData())}  ${entry.entryName}`)
    .sort()
    .join('\n') + '\n'
  zip.addFile('checksums.sha256', Buffer.from(checksums, 'utf-8'))
}

async function writeZipArtifact(filePath: string, zip: AdmZip): Promise<{ path: string; name: string; sha256: string; bytes: number }> {
  const buffer = zip.toBuffer()
  await fs.writeFile(filePath, buffer)
  return {
    path: filePath,
    name: filePath.split(/[\\/]/).pop() ?? filePath,
    sha256: sha256Buffer(buffer),
    bytes: buffer.length
  }
}

async function writeJsonArtifact(filePath: string, value: unknown): Promise<{ path: string; name: string; sha256: string; bytes: number }> {
  const buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  await fs.writeFile(filePath, buffer)
  return {
    path: filePath,
    name: filePath.split(/[\\/]/).pop() ?? filePath,
    sha256: sha256Buffer(buffer),
    bytes: buffer.length
  }
}

async function writeTextArtifact(filePath: string, value: string): Promise<{ path: string; name: string; sha256: string; bytes: number }> {
  const buffer = Buffer.from(value, 'utf-8')
  await fs.writeFile(filePath, buffer)
  return {
    path: filePath,
    name: filePath.split(/[\\/]/).pop() ?? filePath,
    sha256: sha256Buffer(buffer),
    bytes: buffer.length
  }
}

function artifactKind(name: string): string {
  if (name.endsWith('.echo-addon')) return 'native'
  if (name.endsWith('-neoforge.jar')) return 'neoforge'
  if (name.endsWith('-standalone.jar')) return 'standalone'
  if (name.endsWith('-sources.jar')) return 'sources'
  return 'asset'
}

function buildReleaseManifest(
  manifest: Awaited<ReturnType<typeof readManifest>>,
  packageManifest: AddonPackageManifest,
  artifacts: Array<{ name: string; sha256: string; bytes: number }>,
  report: PackOSReport
) {
  if (!manifest) throw new Error('Missing echo.mod.json')
  return {
    schemaVersion: 1,
    id: packageManifest.id,
    kind: 'addon',
    version: manifest.version,
    channel: 'alpha',
    publisher: manifest.publisher.id,
    sourceRepo: `${packageManifest.publisher.githubOwner}/${packageManifest.publisher.githubRepo}`,
    releaseTag: `v${manifest.version}`,
    trust: 'community',
    validation: report.publishingReady ? 'warning' : 'rejected',
    compatibility: packageManifest.targets.map((target) => TARGET_COMPATIBILITY[target]),
    dependencies: packageManifest.dependencies,
    package: {
      schemaVersion: packageManifest.schemaVersion,
      targets: packageManifest.targets
    },
    packos: {
      publishingReady: report.publishingReady,
      issueCount: report.issues.length,
      compatibilityScore: report.compatibilityScore
    },
    assets: artifacts.map((artifact) => ({
      name: artifact.name,
      kind: artifactKind(artifact.name),
      sha256: artifact.sha256,
      size: artifact.bytes
    }))
  }
}

// Run the full project check (used before packaging).
export async function fullProjectReport(projectPath: string): Promise<PackOSReport> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const all = await readAllContent(projectPath)
  const content: Record<string, { id: string; data: unknown }[]> = {}
  for (const [type, records] of Object.entries(all)) {
    content[type] = records.map((r) => ({ id: r.id, data: r.data }))
  }
  const langKeys = await readLangKeys(projectPath)
  const assetFiles = await listAssetFiles(projectPath)
  return runProjectCheck({ manifest, content: content as never, langKeys, assetFiles })
}

// Build a distributable .echo-addon of the project (excludes .studio/, exports/, etc.),
// writes packos.report.json into the bundle, and returns a content hash.
export async function packageAddon(projectPath: string): Promise<PackageResult> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const report = await fullProjectReport(projectPath)
  const packageManifest = buildAddonPackageManifest(manifest)

  const zip = new AdmZip()
  const entries = await fs.readdir(projectPath, { withFileTypes: true })
  addProjectFiles(zip, projectPath, entries)
  addCommonMetadata(zip, manifest, packageManifest, report)
  addChecksums(zip)

  const exportsDir = join(projectPath, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const packageName = `${localId(manifest.id)}-${manifest.version}.echo-addon`
  const zipPath = join(exportsDir, packageName)
  const checksumsPath = join(exportsDir, 'checksums.sha256')
  const packageManifestPath = join(exportsDir, 'echo-addon-package.json')
  const releaseManifestPath = join(exportsDir, 'echo-release.json')
  const releaseDraftPath = join(exportsDir, 'github-release-draft.json')
  const artifactRecords = [await writeZipArtifact(zipPath, zip)]

  if (packageManifest.artifacts.neoforge) {
    const neoforgeZip = new AdmZip()
    addCommonMetadata(neoforgeZip, manifest, packageManifest, report)
    neoforgeZip.addFile('META-INF/neoforge.mods.toml', Buffer.from([
      'modLoader="javafml"',
      'loaderVersion="[1,)"',
      'license="MIT"',
      `[[mods]]`,
      `modId="${localId(manifest.id).replace(/[^a-z0-9_]/gi, '_').toLowerCase()}"`,
      `version="${manifest.version}"`,
      `displayName="${manifest.name.replace(/"/g, '\\"')}"`,
      ''
    ].join('\n'), 'utf-8'))
    addChecksums(neoforgeZip)
    artifactRecords.push(await writeZipArtifact(join(exportsDir, packageManifest.artifacts.neoforge), neoforgeZip))
  }

  if (packageManifest.artifacts.standalone) {
    const standaloneZip = new AdmZip()
    addCommonMetadata(standaloneZip, manifest, packageManifest, report)
    addChecksums(standaloneZip)
    artifactRecords.push(await writeZipArtifact(join(exportsDir, packageManifest.artifacts.standalone), standaloneZip))
  }

  if (packageManifest.artifacts.sources) {
    const sourcesZip = new AdmZip()
    addProjectFiles(sourcesZip, projectPath, entries)
    sourcesZip.addFile('echo-addon-package.json', Buffer.from(JSON.stringify(packageManifest, null, 2), 'utf-8'))
    addChecksums(sourcesZip)
    artifactRecords.push(await writeZipArtifact(join(exportsDir, packageManifest.artifacts.sources), sourcesZip))
  }

  const sdkValidation = validateAddonPackageManifest(packageManifest, artifactRecords.map((artifact) => artifact.name))
  if (!sdkValidation.ok) {
    throw new Error(`SDK package validation failed: ${sdkValidation.issues.join(' ')}`)
  }

  const hash = artifactRecords[0].sha256
  const bufferLength = artifactRecords[0].bytes
  const packageManifestRecord = await writeJsonArtifact(packageManifestPath, packageManifest)
  const releaseManifest = buildReleaseManifest(manifest, packageManifest, artifactRecords, report)
  const releaseManifestRecord = await writeJsonArtifact(releaseManifestPath, releaseManifest)
  const checksumsRecord = await writeTextArtifact(
    checksumsPath,
    [...artifactRecords, packageManifestRecord, releaseManifestRecord].map((artifact) => `${artifact.sha256}  ${artifact.name}`).sort().join('\n') + '\n'
  )
  await fs.writeFile(releaseDraftPath, JSON.stringify({
    draft: true,
    prerelease: true,
    tag_name: `v${manifest.version}`,
    name: `${manifest.name} ${manifest.version}`,
    body: [
      `ECHO addon package for ${manifest.id}.`,
      '',
      `SDK validation: ${sdkValidation.ok ? 'ready' : 'not ready'}.`,
      `PackOS validation: ${report.publishingReady ? 'ready' : 'not ready'}.`,
      `Issues: ${report.issues.length}.`,
      '',
      'Assets:',
      ...artifactRecords.map((artifact) => `- ${artifact.name}`),
      '- checksums.sha256',
      '- echo-addon-package.json',
      '- echo-release.json'
    ].join('\n'),
    assets: [
      ...artifactRecords.map((artifact) => ({ path: artifact.path, name: artifact.name, sha256: artifact.sha256 })),
      { path: checksumsPath, name: 'checksums.sha256', sha256: checksumsRecord.sha256 },
      { path: packageManifestPath, name: 'echo-addon-package.json', sha256: packageManifestRecord.sha256 },
      { path: releaseManifestPath, name: 'echo-release.json', sha256: releaseManifestRecord.sha256 }
    ],
    releaseIndex: {
      id: localId(manifest.id),
      kind: 'addon',
      version: manifest.version,
      publisher: manifest.publisher.id,
      validation: report.publishingReady ? 'warning' : 'rejected'
    }
  }, null, 2), 'utf-8')

  return {
    zipPath,
    hash,
    bytes: bufferLength,
    report,
    sdkValidation,
    assetPaths: artifactRecords.map((artifact) => artifact.path),
    checksumsPath,
    packageManifestPath,
    releaseManifestPath,
    releaseDraftPath
  }
}
