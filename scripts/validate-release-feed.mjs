#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const POLICY = {
  'public:echo-launcher': {
    track: 'public',
    stream: 'echo-launcher',
    owner: 'knoxhack',
    repo: 'ECHO-Launcher',
    tagPrefix: 'launcher-v',
    packageNames: ['echo-launcher'],
    sourcePairs: [['LAUNCHER_UPDATE_OWNER', 'LAUNCHER_UPDATE_REPO']],
    publicOnly: true,
  },
  'public:echo-addons-studio': {
    track: 'public',
    stream: 'echo-addons-studio',
    owner: 'knoxhack',
    repo: 'ECHO-Addons-Studio',
    tagPrefix: 'v',
    packageNames: ['echo-addons-studio', 'echo-addon-studio'],
    sourcePairs: [['UPDATE_FEED_OWNER_PUBLIC', 'UPDATE_FEED_REPO_PUBLIC']],
    forbiddenSourcePairs: [['UPDATE_FEED_OWNER_INTERNAL', 'UPDATE_FEED_REPO_INTERNAL']],
    publicOnly: true,
  },
  'public:echo-developers-studio': {
    track: 'public',
    stream: 'echo-developers-studio',
    owner: 'knoxhack',
    repo: 'ECHO-Developer-Studio',
    tagPrefix: 'v',
    packageNames: ['echo-developers-studio', 'echo-developer-studio'],
    sourcePairs: [['DEV_PUBLIC_UPDATE_FEED_OWNER', 'DEV_PUBLIC_UPDATE_FEED_REPO']],
    dualTrack: true,
  },
  'public:echo-sdk': {
    track: 'public',
    stream: 'echo-sdk',
    owner: 'knoxhack',
    repo: 'ECHO-SDK',
    tagPrefix: 'sdk-v',
    packageNames: ['echo-sdk'],
  },
  'internal:echo-developers-studio-internal': {
    track: 'internal',
    stream: 'echo-developers-studio-internal',
    owner: 'knoxhack',
    repo: 'ECHO-Developer-Studio',
    tagPrefix: 'v',
    packageNames: ['echo-developers-studio-internal', 'echo-developers-studio', 'echo-developer-studio'],
    sourcePairs: [['DEV_UPDATE_FEED_OWNER', 'DEV_UPDATE_FEED_REPO']],
    dualTrack: true,
  },
  'internal:echo-addons-studio-internal': {
    track: 'internal',
    stream: 'echo-addons-studio-internal',
    owner: 'knoxhack',
    repo: 'ECHO-Addons-Studio',
    tagPrefix: 'v',
    packageNames: ['echo-addons-studio-internal'],
  },
  'internal:echo-core-internal': {
    track: 'internal',
    stream: 'echo-core-internal',
    owner: 'knoxhack',
    repo: 'ECHO-Native-Platform',
    tagPrefix: 'core-v',
    packageNames: ['echo-core-internal'],
  },
  'internal:echo-launcher-internal': {
    track: 'internal',
    stream: 'echo-launcher-internal',
    owner: 'knoxhack',
    repo: 'ECHO-Launcher',
    tagPrefix: 'launcher-internal-v',
    packageNames: ['echo-launcher-internal'],
  },
  'index:echo-release-index': {
    track: 'index',
    stream: 'echo-release-index',
    owner: 'knoxhack',
    repo: 'ECHO-Release-Index',
    tagPrefix: 'index-v',
    packageNames: ['echo-release-index'],
  },
}

const INTERNAL_REPOS = new Set(
  Object.values(POLICY)
    .filter((entry) => entry.track === 'internal' && entry.internalOnly)
    .map((entry) => entry.repo.toLowerCase()),
)
const PUBLIC_REPOS = new Set(
  Object.values(POLICY)
    .filter((entry) => entry.track === 'public')
    .map((entry) => entry.repo.toLowerCase()),
)

function usage() {
  console.error(`Usage:
  node scripts/validate-release-feed.mjs --stream <stream> --track <public|internal|index> [options]

Options:
  --builder <path>       package.json or electron-builder yaml to validate. Repeatable.
  --source <path>        source file with updater constants to validate. Repeatable.
  --package <path>       package.json to validate package name. Defaults to package.json when present.
  --tag <tag>            release tag to check against the stream prefix.
  --public-only          fail if an internal feed repo/constant appears in source.
  --assert-artifacts <dir> fail if public artifacts contain internal names.
`)
}

function parseArgs(argv) {
  const args = { builders: [], sources: [], packages: [], artifactDirs: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`)
      return argv[index]
    }
    switch (arg) {
      case '--stream':
      case '--app':
        args.stream = next()
        break
      case '--track':
        args.track = next()
        break
      case '--builder':
        args.builders.push(next())
        break
      case '--source':
        args.sources.push(next())
        break
      case '--package':
        args.packages.push(next())
        break
      case '--tag':
        args.tag = next()
        break
      case '--public-only':
        args.publicOnly = true
        break
      case '--assert-artifacts':
        args.artifactDirs.push(next())
        break
      case '--help':
      case '-h':
        usage()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function readJson(filePath) {
  return JSON.parse(readText(filePath))
}

function existingPath(filePath) {
  return fs.existsSync(filePath) ? filePath : null
}

function getPolicy(args) {
  const envTrack = process.env.RELEASE_TRACK || process.env.ECHO_UPDATE_STREAM
  const envStream = process.env.RELEASE_STREAM || process.env.RELEASE_APP || process.env.RELEASE_POLICY_STREAM
  const track = normalize(args.track || envTrack)
  const stream = normalize(args.stream || envStream)
  if (!track || !stream) {
    throw new Error('Both --track and --stream are required, either as args or RELEASE_TRACK/RELEASE_STREAM env.')
  }
  const policy = POLICY[`${track}:${stream}`]
  if (!policy) {
    throw new Error(`No release feed policy for ${track}:${stream}.`)
  }
  return policy
}

function assertEqual(label, actual, expected) {
  if (normalize(actual) !== normalize(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual || '<empty>'}.`)
  }
}

function validateEnv(policy) {
  const track = process.env.RELEASE_TRACK || process.env.ECHO_UPDATE_STREAM
  if (track) assertEqual('RELEASE_TRACK', track, policy.track)

  const stream = process.env.RELEASE_STREAM || process.env.RELEASE_APP || process.env.RELEASE_POLICY_STREAM
  if (stream) assertEqual('RELEASE_STREAM', stream, policy.stream)

  if (process.env.RELEASE_FEED_OWNER) assertEqual('RELEASE_FEED_OWNER', process.env.RELEASE_FEED_OWNER, policy.owner)
  if (process.env.RELEASE_FEED_REPO) assertEqual('RELEASE_FEED_REPO', process.env.RELEASE_FEED_REPO, policy.repo)

  const scopedOwner = policy.track === 'public' ? process.env.PUBLIC_FEED_OWNER : process.env.INTERNAL_FEED_OWNER
  const scopedRepo = policy.track === 'public' ? process.env.PUBLIC_FEED_REPO : process.env.INTERNAL_FEED_REPO
  if (scopedOwner) assertEqual(`${policy.track.toUpperCase()}_FEED_OWNER`, scopedOwner, policy.owner)
  if (scopedRepo) assertEqual(`${policy.track.toUpperCase()}_FEED_REPO`, scopedRepo, policy.repo)

  if (process.env.RELEASE_TRACK_DISALLOWS_CROSSTALK && normalize(process.env.RELEASE_TRACK_DISALLOWS_CROSSTALK) !== 'true') {
    throw new Error('RELEASE_TRACK_DISALLOWS_CROSSTALK must be true when set.')
  }
}

function validateTag(policy, tag) {
  if (!tag) return
  if (!String(tag).startsWith(policy.tagPrefix)) {
    throw new Error(`Tag '${tag}' must start with '${policy.tagPrefix}' for ${policy.stream}.`)
  }
}

function parseYamlPublish(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const pairs = []
  for (let index = 0; index < lines.length; index += 1) {
    const publishMatch = /^(\s*)publish:\s*$/.exec(lines[index])
    if (!publishMatch) continue
    const baseIndent = publishMatch[1].length
    let owner = ''
    let repo = ''
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]
      if (!line.trim() || line.trim().startsWith('#')) continue
      const indent = /^(\s*)/.exec(line)?.[1].length ?? 0
      if (indent <= baseIndent) break
      const ownerMatch = /^\s*owner:\s*['"]?([^'"\s#]+)['"]?/.exec(line)
      const repoMatch = /^\s*repo:\s*['"]?([^'"\s#]+)['"]?/.exec(line)
      if (ownerMatch) owner = ownerMatch[1]
      if (repoMatch) repo = repoMatch[1]
    }
    if (owner || repo) pairs.push({ owner, repo })
  }
  return pairs
}

function parseJsonPublish(json) {
  const publish = json?.build?.publish ?? json?.publish
  const entries = Array.isArray(publish) ? publish : publish ? [publish] : []
  return entries
    .filter((entry) => normalize(entry?.provider || 'github') === 'github' || entry?.owner || entry?.repo)
    .map((entry) => ({ owner: entry.owner, repo: entry.repo }))
}

function validatePublishPair(policy, label, pair) {
  if (!pair.owner || !pair.repo) {
    throw new Error(`${label} has incomplete GitHub publish config.`)
  }
  assertEqual(`${label} owner`, pair.owner, policy.owner)
  assertEqual(`${label} repo`, pair.repo, policy.repo)
}

function validateBuilder(policy, filePath) {
  const absolutePath = path.resolve(filePath)
  const text = readText(absolutePath)
  const pairs = /\.json$/i.test(filePath) ? parseJsonPublish(JSON.parse(text)) : parseYamlPublish(text)
  if (pairs.length === 0) {
    throw new Error(`${filePath} does not contain a GitHub publish target.`)
  }
  pairs.forEach((pair, index) => validatePublishPair(policy, `${filePath} publish[${index}]`, pair))
}

function validatePackage(policy, filePath) {
  const json = readJson(path.resolve(filePath))
  if (json.name && !policy.packageNames.map(normalize).includes(normalize(json.name))) {
    throw new Error(`${filePath} package name '${json.name}' is not allowed for ${policy.stream}.`)
  }
}

function constantValue(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escaped}\\s*=\\s*['"]([^'"]+)['"]`).exec(text)
  return match?.[1] ?? ''
}

function validateSourceConstants(policy, filePath) {
  const text = readText(path.resolve(filePath))
  for (const [ownerName, repoName] of policy.sourcePairs ?? []) {
    const owner = constantValue(text, ownerName)
    const repo = constantValue(text, repoName)
    if (!owner || !repo) throw new Error(`${filePath} is missing ${ownerName}/${repoName} constants.`)
    assertEqual(`${filePath} ${ownerName}`, owner, policy.owner)
    assertEqual(`${filePath} ${repoName}`, repo, policy.repo)
  }

  for (const [ownerName, repoName] of policy.forbiddenSourcePairs ?? []) {
    const owner = constantValue(text, ownerName)
    const repo = constantValue(text, repoName)
    if (owner || repo) {
      throw new Error(`${filePath} contains forbidden ${ownerName}/${repoName} constants for ${policy.stream}.`)
    }
  }

  if (!policy.dualTrack && (policy.publicOnly || policy.track === 'public')) {
    for (const internalRepo of INTERNAL_REPOS) {
      if (normalize(policy.repo) !== internalRepo && text.toLowerCase().includes(internalRepo)) {
        throw new Error(`${filePath} references internal repo '${internalRepo}' from public stream ${policy.stream}.`)
      }
    }
  }

  if (!policy.dualTrack && policy.track === 'internal') {
    for (const publicRepo of PUBLIC_REPOS) {
      if (normalize(policy.repo) !== publicRepo && text.toLowerCase().includes(publicRepo)) {
        throw new Error(`${filePath} references public repo '${publicRepo}' from internal stream ${policy.stream}.`)
      }
    }
  }
}

function walkFiles(root) {
  const result = []
  if (!fs.existsSync(root)) return result
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath))
    } else {
      result.push(fullPath)
    }
  }
  return result
}

function validateArtifacts(policy, artifactDir) {
  if (!fs.existsSync(artifactDir)) return
  const files = walkFiles(artifactDir)
  const forbidden = policy.track === 'public' ? [...INTERNAL_REPOS, 'internal'] : [...PUBLIC_REPOS, 'public']
  for (const file of files) {
    const name = path.basename(file).toLowerCase()
    const hit = forbidden.find((token) => name.includes(token))
    if (hit) {
      throw new Error(`Artifact ${file} includes forbidden ${policy.track === 'public' ? 'internal' : 'public'} token '${hit}'.`)
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const policy = getPolicy(args)
  const tag = args.tag || process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME

  validateEnv(policy)
  validateTag(policy, tag)

  const defaultPackage = existingPath('package.json')
  const packages = args.packages.length > 0 ? args.packages : defaultPackage ? [defaultPackage] : []
  packages.forEach((filePath) => validatePackage(policy, filePath))
  args.builders.forEach((filePath) => validateBuilder(policy, filePath))
  args.sources.forEach((filePath) => validateSourceConstants(policy, filePath))
  args.artifactDirs.forEach((dir) => validateArtifacts(policy, dir))

  console.log(`Release feed policy OK: ${policy.track}:${policy.stream} -> ${policy.owner}/${policy.repo}`)
}

try {
  main()
} catch (error) {
  console.error(`Release feed policy failed: ${error.message}`)
  process.exit(1)
}
