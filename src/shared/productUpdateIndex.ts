export type ReleaseIndexProductEntry = {
  id?: string
  kind?: string
  version?: string
  sourceRepo?: string
  compatibility?: string[]
  validation?: string
  artifacts?: unknown
}

export type IndexedProductArtifact = {
  role: string
  name: string
  url: string
  sha256: string
  size?: number
}

export type IndexedProductUpdate = {
  entry: ReleaseIndexProductEntry
  feed: { owner: string; repo: string }
  artifacts: {
    latestYml: IndexedProductArtifact
    installer: IndexedProductArtifact
    blockmap?: IndexedProductArtifact
  }
}

function artifactRecords(artifacts: unknown): IndexedProductArtifact[] {
  const records: IndexedProductArtifact[] = []
  const visit = (node: unknown, role = 'asset'): void => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, role))
      return
    }
    if (!node || typeof node !== 'object') return
    const row = node as Record<string, unknown>
    const name = row.file ?? row.name ?? row.filename
    const url = row.url ?? row.downloadUrl
    const sha256 = row.sha256
    if (name && url && sha256) {
      records.push({
        role,
        name: String(name),
        url: String(url),
        sha256: String(sha256),
        size: row.size === undefined ? undefined : Number(row.size)
      })
    }
    Object.entries(row).forEach(([key, value]) => visit(value, key))
  }
  visit(artifacts)
  return records
}

function validArtifact(artifact: IndexedProductArtifact | undefined): artifact is IndexedProductArtifact {
  return Boolean(
    artifact &&
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\//.test(artifact.url) &&
      /^[a-f0-9]{64}$/i.test(artifact.sha256)
  )
}

export function selectIndexedProductUpdate(entry: ReleaseIndexProductEntry, productId: string): IndexedProductUpdate {
  if (entry.id !== productId) throw new Error(`Release Index product ${productId} was not found.`)
  if (entry.validation !== 'approved') throw new Error(`Release Index product ${productId} is ${entry.validation ?? 'missing validation'}.`)

  const sourceRepo = String(entry.sourceRepo ?? '')
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(sourceRepo)
  if (!match) throw new Error(`Release Index product ${productId} has invalid sourceRepo.`)

  const artifacts = artifactRecords(entry.artifacts)
  const latestYml = artifacts.find((artifact) => artifact.role === 'latestYml' || /^latest\.ya?ml$/i.test(artifact.name))
  const installer = artifacts.find((artifact) => artifact.role === 'windowsSetup' || /setup.*\.exe$/i.test(artifact.name))
  const blockmap = artifacts.find((artifact) => artifact.role === 'windowsSetupBlockmap' || /setup.*\.exe\.blockmap$/i.test(artifact.name))

  if (!validArtifact(latestYml)) throw new Error(`Release Index product ${productId} has no exact latest.yml artifact.`)
  if (!validArtifact(installer)) throw new Error(`Release Index product ${productId} has no exact Windows installer artifact.`)
  if (blockmap && !validArtifact(blockmap)) throw new Error(`Release Index product ${productId} has an invalid blockmap artifact.`)

  return {
    entry,
    feed: { owner: match[1], repo: match[2] },
    artifacts: {
      latestYml,
      installer,
      ...(blockmap ? { blockmap } : {})
    }
  }
}
