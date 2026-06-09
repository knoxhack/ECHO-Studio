export type AddonPackageTarget = 'native' | 'neoforge' | 'standalone'
export type AddonPackageArtifactKey = AddonPackageTarget | 'sources'
export type AddonPackageDependencyKind = 'product' | 'modpack' | 'module' | 'addon' | 'runtime' | 'studio' | 'website'

export interface AddonPackageDependency {
  id: string
  kind?: AddonPackageDependencyKind
  version: string
}

export interface AddonPackageManifest {
  schemaVersion: 'echo.addon.package.v1'
  id: string
  version: string
  publisher: {
    githubOwner: string
    githubRepo: string
  }
  targets: AddonPackageTarget[]
  dependencies: AddonPackageDependency[]
  artifacts: Partial<Record<AddonPackageArtifactKey, string>>
}

export interface AddonPackageValidationResult {
  ok: boolean
  issues: string[]
}

const artifactPatterns: Record<AddonPackageArtifactKey, RegExp> = {
  native: /^[^/\\]+\.echo-addon$/,
  neoforge: /^[^/\\]+-neoforge\.jar$/,
  standalone: /^[^/\\]+-standalone\.jar$/,
  sources: /^[^/\\]+-sources\.jar$/
}

const targetArtifactKeys: Record<AddonPackageTarget, AddonPackageArtifactKey> = {
  native: 'native',
  neoforge: 'neoforge',
  standalone: 'standalone'
}

const dependencyKinds = new Set<AddonPackageDependencyKind>([
  'product',
  'modpack',
  'module',
  'addon',
  'runtime',
  'studio',
  'website'
])

export function validateAddonPackageManifest(
  manifest: AddonPackageManifest,
  builtArtifactNames: string[] = []
): AddonPackageValidationResult {
  const issues: string[] = []
  const built = new Set(builtArtifactNames)
  if (manifest.schemaVersion !== 'echo.addon.package.v1') issues.push('schemaVersion must be echo.addon.package.v1.')
  if (!/^[a-z][a-z0-9_-]*$/.test(manifest.id)) issues.push('id must match ^[a-z][a-z0-9_-]*$.')
  if (!manifest.version.trim()) issues.push('version is required.')
  if (!manifest.publisher?.githubOwner?.trim()) issues.push('publisher.githubOwner is required.')
  if (!manifest.publisher?.githubRepo?.trim()) issues.push('publisher.githubRepo is required.')
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) issues.push('targets must contain at least one runtime target.')

  const seenTargets = new Set<string>()
  for (const target of manifest.targets ?? []) {
    if (!['native', 'neoforge', 'standalone'].includes(target)) issues.push(`Unsupported target: ${target}.`)
    if (seenTargets.has(target)) issues.push(`Duplicate target: ${target}.`)
    seenTargets.add(target)
    const artifactKey = targetArtifactKeys[target]
    if (artifactKey && !manifest.artifacts?.[artifactKey]) issues.push(`Missing ${artifactKey} artifact for target ${target}.`)
  }

  for (const dependency of manifest.dependencies ?? []) {
    if (!String(dependency.id ?? '').trim()) issues.push('Dependency id is required.')
    if (dependency.kind && !dependencyKinds.has(dependency.kind)) {
      issues.push(`Dependency ${dependency.id ?? '(unknown)'} has unsupported kind: ${dependency.kind}.`)
    }
    if (!String(dependency.version ?? '').trim()) issues.push(`Dependency ${dependency.id ?? '(unknown)'} version is required.`)
  }

  for (const [key, name] of Object.entries(manifest.artifacts ?? {})) {
    const artifactKey = key as AddonPackageArtifactKey
    if (!artifactPatterns[artifactKey]) {
      issues.push(`Unsupported artifact key: ${key}.`)
      continue
    }
    if (!artifactPatterns[artifactKey].test(String(name))) {
      issues.push(`${key} artifact has invalid filename: ${name}.`)
    }
    if (builtArtifactNames.length > 0 && !built.has(String(name))) {
      issues.push(`${key} artifact was not built: ${name}.`)
    }
  }

  return { ok: issues.length === 0, issues }
}
