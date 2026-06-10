import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import AdmZip from 'adm-zip'
import { readManifest, listAssetFiles } from './fsService'
import { readAllContent, readLangKeys } from './contentService'
import { runProjectCheck } from '../shared/projectValidation'
import { buildAddonPackageManifest } from '../shared/templates'
import { validateAddonPackageManifest } from '../shared/addonPackageContract'
import { buildNeoForgeModsToml } from '../shared/neoforgeMetadata'
import type { TargetExperience, ValidationReport } from '../shared/types'
import type { DevWorkspaceState } from '../shared/devWorkspace'
import type { PackageResult, ReleaseIndexHandoff, ReleaseIndexHandoffAsset } from '../shared/publishing'
import type { AddonPackageManifest, AddonPackageTarget } from '../shared/addonPackageContract'
import { listEchoModules } from './moduleCatalogService'

const EXCLUDE_DIRS = new Set([
  '.studio',
  '.echo-studio',
  '.gradle',
  '.git',
  'build',
  'exports',
  'node_modules',
  'release'
])
const execFileAsync = promisify(execFile)
const TARGET_RUNTIME_SLUGS: Record<AddonPackageTarget, string> = {
  native: 'native-edition',
  neoforge: 'neoforge-edition',
  standalone: 'standalone-edition'
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

function addCommonMetadata(zip: AdmZip, manifest: unknown, packageManifest: unknown, report: ValidationReport): void {
  zip.addFile('META-INF/echo.mod.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'))
  zip.addFile('echo-addon-package.json', Buffer.from(JSON.stringify(packageManifest, null, 2), 'utf-8'))
  zip.addFile('validation.report.json', Buffer.from(JSON.stringify(report, null, 2), 'utf-8'))
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

function targetExperienceSlug(experience: TargetExperience): string {
  return experience.replace(/_/g, '-')
}

function releaseCompatibility(
  manifest: NonNullable<Awaited<ReturnType<typeof readManifest>>>,
  targets: AddonPackageTarget[]
): string[] {
  const experiences = manifest.target.experiences.length ? manifest.target.experiences : ['generic' as TargetExperience]
  const values = experiences.flatMap((experience) =>
    targets.map((target) => `${targetExperienceSlug(experience)}-${TARGET_RUNTIME_SLUGS[target]}`)
  )
  return Array.from(new Set(values)).sort()
}

function realCommitSha(value: unknown): string | undefined {
  const sha = String(value ?? '').trim()
  return /^[a-f0-9]{7,40}$/i.test(sha) && !/^0{7,40}$/.test(sha) ? sha : undefined
}

async function sourceCommitSha(projectPath: string): Promise<string | undefined> {
  const override = realCommitSha(process.env.ECHO_STUDIO_COMMIT_SHA) ?? realCommitSha(process.env.ECHO_ADDON_STUDIO_COMMIT_SHA)
  if (override) return override
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], { timeout: 3000 })
    return realCommitSha(stdout)
  } catch {
    return undefined
  }
}

function buildReleaseManifest(
  manifest: Awaited<ReturnType<typeof readManifest>>,
  packageManifest: AddonPackageManifest,
  artifacts: Array<{ name: string; sha256: string; bytes: number }>,
  report: ValidationReport,
  commitSha?: string
) {
  if (!manifest) throw new Error('Missing echo.mod.json')
  const artifactMap = Object.fromEntries(
    artifacts.map((artifact) => [
      artifactKind(artifact.name),
      {
        file: artifact.name,
        sha256: artifact.sha256,
        size: artifact.bytes
      }
    ])
  )
  return {
    schemaVersion: 'echo.release.index.entry.v1',
    id: packageManifest.id,
    kind: 'addon',
    version: manifest.version,
    channel: 'alpha',
    publisher: manifest.publisher.id,
    sourceRepo: `${packageManifest.publisher.githubOwner}/${packageManifest.publisher.githubRepo}`,
    releaseTag: `v${manifest.version}`,
    ...(commitSha ? { commitSha } : {}),
    trust: 'community',
    validation: report.publishingReady ? 'warning' : 'rejected',
    compatibility: releaseCompatibility(manifest, packageManifest.targets),
    dependencies: packageManifest.dependencies,
    artifacts: artifactMap,
    package: {
      schemaVersion: packageManifest.schemaVersion,
      targets: packageManifest.targets
    },
    validationReport: {
      publishingReady: report.publishingReady,
      issueCount: report.issues.length,
      compatibilityScore: report.compatibilityScore
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

function buildHandoffAsset(
  artifact: { path?: string; name: string; sha256: string; bytes: number },
  role: ReleaseIndexHandoffAsset['role']
): ReleaseIndexHandoffAsset {
  return {
    path: artifact.path,
    name: artifact.name,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    role
  }
}

function buildReleaseIndexHandoff(
  releaseManifest: ReturnType<typeof buildReleaseManifest>,
  packageManifest: AddonPackageManifest,
  releaseAssets: Array<{ path: string; name: string; sha256: string; bytes: number }>,
  sidecars: Array<{ path: string; name: string; sha256: string; bytes: number }>,
  checksumsRecord: { name: string; sha256: string },
  report: ValidationReport,
  commitSha?: string
): ReleaseIndexHandoff {
  const sourceRepo = releaseManifest.sourceRepo
  const releaseTag = releaseManifest.releaseTag
  return {
    schemaVersion: 'echo.release.index.handoff.v1',
    generatedAt: new Date().toISOString(),
    targetRepository: 'knoxhack/ECHO-Release-Index',
    targetCollection: 'addons',
    entryFileName: `${packageManifest.id}.json`,
    entry: releaseManifest,
    sourceRepo,
    releaseTag,
    ...(commitSha ? { commitSha } : {}),
    assets: [
      ...releaseAssets.map((artifact) => buildHandoffAsset(artifact, 'artifact')),
      ...sidecars.map((artifact) => buildHandoffAsset(artifact, 'sidecar'))
    ],
    checksums: {
      file: 'checksums.sha256',
      sha256: checksumsRecord.sha256
    },
    attestation: {
      mode: 'required-for-official-or-verified',
      provider: 'github-artifact-attestations',
      requiredWorkflow: '.github/workflows/release.yml',
      requireDigestMatch: true,
      subjects: releaseAssets.map((artifact) => ({
        name: artifact.name,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
        sourceRepo,
        releaseTag,
        ...(commitSha ? { commitSha } : {})
      }))
    },
    ingestion: {
      status: 'pending-review',
      requireSchemaValidation: true,
      requireValidationReady: report.publishingReady,
      notes: [
        'Release Index ingestion must verify all SHA-256 digests before approval.',
        'Official or verified promotion requires GitHub artifact attestation verification for each artifact subject.',
        'Community releases may remain warning-state until publisher trust and runtime artifacts are verified.'
      ]
    }
  }
}

function buildReleaseIndexSubmissionNotes(
  handoff: ReleaseIndexHandoff,
  report: ValidationReport,
  handoffRecord: { name: string; sha256: string; bytes: number }
): string {
  const entry = handoff.entry as {
    validation?: string
    trust?: string
    compatibility?: string[]
    dependencies?: Array<{ id: string; kind: string; version?: string }>
  }
  const artifactLines = handoff.assets
    .filter((asset) => asset.role === 'artifact')
    .map((asset) => `- ${asset.name} (${asset.bytes} bytes, sha256 ${asset.sha256})`)
  const sidecarLines = handoff.assets
    .filter((asset) => asset.role === 'sidecar')
    .map((asset) => `- ${asset.name} (${asset.bytes} bytes, sha256 ${asset.sha256})`)
  const attestationLines = handoff.attestation.subjects.map((subject) => (
    `- ${subject.name} from ${subject.sourceRepo}@${subject.releaseTag} (sha256 ${subject.sha256})`
  ))
  const dependencies = entry.dependencies?.length
    ? entry.dependencies.map((dependency) => `${dependency.id} (${dependency.kind} ${dependency.version ?? '*'})`).join(', ')
    : 'None'
  const compatibility = entry.compatibility?.length ? entry.compatibility.join(', ') : 'None'
  return [
    '# Release Index Submission',
    '',
    `Generated: ${handoff.generatedAt}`,
    '',
    '## Target',
    `- Repository: ${handoff.targetRepository}`,
    `- Entry path: ${handoff.targetCollection}/${handoff.entryFileName}`,
    `- Source release: ${handoff.sourceRepo}@${handoff.releaseTag}`,
    `- Commit: ${handoff.commitSha ?? 'Not recorded'}`,
    '',
    '## Review State',
    `- Ingestion status: ${handoff.ingestion.status}`,
    `- Release validation: ${entry.validation ?? 'unknown'}`,
    `- Trust target: ${entry.trust ?? 'community'}`,
    `- Validation ready: ${report.publishingReady ? 'yes' : 'no'}`,
    `- Validation score: ${report.compatibilityScore}% (${report.issues.length} issue(s))`,
    `- Compatibility: ${compatibility}`,
    `- Dependencies: ${dependencies}`,
    '',
    '## Release Assets',
    ...artifactLines,
    '',
    '## Sidecars',
    ...sidecarLines,
    `- ${handoffRecord.name} (${handoffRecord.bytes} bytes, sha256 ${handoffRecord.sha256})`,
    '- release-index-submission.md (review notes, not part of checksums.sha256)',
    '',
    '## Checksums',
    `- Checksums file: ${handoff.checksums.file}`,
    `- Checksums file SHA-256: ${handoff.checksums.sha256}`,
    '- Verify artifact and manifest sidecar digests before approving the index entry.',
    '- Verify draft asset SHA-256 metadata for release-index-handoff.json and this submission note.',
    '',
    '## Attestation',
    `- Provider: ${handoff.attestation.provider}`,
    `- Required workflow: ${handoff.attestation.requiredWorkflow}`,
    `- Digest match required: ${handoff.attestation.requireDigestMatch ? 'yes' : 'no'}`,
    ...attestationLines,
    '',
    '## Ingestion Checklist',
    '- [ ] Upload every release asset and sidecar to the GitHub release draft.',
    '- [ ] Validate release-index-handoff.json and echo-release.json against Release Index schemas.',
    '- [ ] Verify SHA-256 values against checksums.sha256 and draft asset metadata.',
    '- [ ] Resolve dependency references and apply block overrides before approval.',
    '- [ ] Verify GitHub artifact attestations before moving trust to official or verified.',
    `- [ ] Import the approved entry into ${handoff.targetCollection}/${handoff.entryFileName}.`,
    ''
  ].join('\n')
}

// Run the full project check (used before packaging).
export async function fullProjectReport(projectPath: string, devWorkspace?: DevWorkspaceState): Promise<ValidationReport> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const all = await readAllContent(projectPath)
  const content: Record<string, { id: string; data: unknown }[]> = {}
  for (const [type, records] of Object.entries(all)) {
    content[type] = records.map((r) => ({ id: r.id, data: r.data }))
  }
  const langKeys = await readLangKeys(projectPath)
  const assetFiles = await listAssetFiles(projectPath)
  const moduleCatalog = await listEchoModules(projectPath)
  return runProjectCheck({
    manifest,
    content: content as never,
    langKeys,
    assetFiles,
    moduleCatalog: moduleCatalog.catalog,
    devWorkspace,
    artifactReadiness: devWorkspace ? 'packaging' : 'current'
  })
}

// Build a distributable .echo-addon of the project (excludes local Studio state and build outputs),
// writes validation report sidecars into the bundle, and returns a content hash.
export async function packageAddon(projectPath: string, devWorkspace?: DevWorkspaceState): Promise<PackageResult> {
  const manifest = await readManifest(projectPath)
  if (!manifest) throw new Error('Missing echo.mod.json')
  const report = await fullProjectReport(projectPath, devWorkspace)
  const moduleCatalog = await listEchoModules(projectPath)
  const packageManifest = buildAddonPackageManifest(manifest, moduleCatalog.catalog)

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
  const releaseIndexHandoffPath = join(exportsDir, 'release-index-handoff.json')
  const releaseIndexSubmissionPath = join(exportsDir, 'release-index-submission.md')
  const releaseDraftPath = join(exportsDir, 'github-release-draft.json')
  const artifactRecords = [await writeZipArtifact(zipPath, zip)]

  if (packageManifest.artifacts.neoforge) {
    const neoforgeZip = new AdmZip()
    addCommonMetadata(neoforgeZip, manifest, packageManifest, report)
    neoforgeZip.addFile('META-INF/neoforge.mods.toml', Buffer.from(buildNeoForgeModsToml(manifest), 'utf-8'))
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
    throw new Error(`Package contract validation failed: ${sdkValidation.issues.join(' ')}`)
  }

  const hash = artifactRecords[0].sha256
  const bufferLength = artifactRecords[0].bytes
  const packageManifestRecord = await writeJsonArtifact(packageManifestPath, packageManifest)
  const commitSha = await sourceCommitSha(projectPath)
  const releaseManifest = buildReleaseManifest(manifest, packageManifest, artifactRecords, report, commitSha)
  const releaseManifestRecord = await writeJsonArtifact(releaseManifestPath, releaseManifest)
  const checksumsRecord = await writeTextArtifact(
    checksumsPath,
    [...artifactRecords, packageManifestRecord, releaseManifestRecord].map((artifact) => `${artifact.sha256}  ${artifact.name}`).sort().join('\n') + '\n'
  )
  const releaseIndexHandoff = buildReleaseIndexHandoff(
    releaseManifest,
    packageManifest,
    artifactRecords,
    [checksumsRecord, packageManifestRecord, releaseManifestRecord],
    checksumsRecord,
    report,
    commitSha
  )
  const releaseIndexHandoffRecord = await writeJsonArtifact(releaseIndexHandoffPath, releaseIndexHandoff)
  const releaseIndexSubmissionRecord = await writeTextArtifact(
    releaseIndexSubmissionPath,
    buildReleaseIndexSubmissionNotes(releaseIndexHandoff, report, releaseIndexHandoffRecord)
  )
  const draftAssets = [
    ...artifactRecords.map((artifact) => ({ path: artifact.path, name: artifact.name, sha256: artifact.sha256 })),
    { path: checksumsPath, name: 'checksums.sha256', sha256: checksumsRecord.sha256 },
    { path: packageManifestPath, name: 'echo-addon-package.json', sha256: packageManifestRecord.sha256 },
    { path: releaseManifestPath, name: 'echo-release.json', sha256: releaseManifestRecord.sha256 },
    { path: releaseIndexHandoffPath, name: 'release-index-handoff.json', sha256: releaseIndexHandoffRecord.sha256 },
    { path: releaseIndexSubmissionPath, name: 'release-index-submission.md', sha256: releaseIndexSubmissionRecord.sha256 }
  ]
  await fs.writeFile(releaseDraftPath, JSON.stringify({
    draft: true,
    prerelease: true,
    tag_name: `v${manifest.version}`,
    name: `${manifest.name} ${manifest.version}`,
    body: [
      `ECHO addon package for ${manifest.id}.`,
      '',
      `Package contract validation: ${sdkValidation.ok ? 'ready' : 'not ready'}.`,
      `Project validation: ${report.publishingReady ? 'ready' : 'not ready'}.`,
      `Issues: ${report.issues.length}.`,
      '',
      'Assets:',
      ...artifactRecords.map((artifact) => `- ${artifact.name}`),
      '- checksums.sha256',
      '- echo-addon-package.json',
      '- echo-release.json',
      '- release-index-handoff.json',
      '- release-index-submission.md',
      '',
      'Release Index handoff:',
      '- Import release-index-handoff.json into knoxhack/ECHO-Release-Index after review.',
      '- Verify all SHA-256 digests against checksums.sha256 before approval.',
      '- Official or verified promotion requires GitHub artifact attestation verification for each artifact subject.'
    ].join('\n'),
    assets: draftAssets,
    releaseIndex: {
      id: localId(manifest.id),
      kind: 'addon',
      version: manifest.version,
      ...(commitSha ? { commitSha } : {}),
      artifacts: releaseManifest.artifacts,
      publisher: manifest.publisher.id,
      validation: report.publishingReady ? 'warning' : 'rejected'
    },
    releaseIndexHandoff,
    attestation: releaseIndexHandoff.attestation
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
    releaseIndexHandoffPath,
    releaseIndexSubmissionPath,
    releaseDraftPath,
    releaseIndexPreview: releaseManifest,
    releaseIndexHandoff
  }
}
