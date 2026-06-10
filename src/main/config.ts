import { app } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { DEFAULT_CONFIG } from '../shared/config'
import { PREVIEW_SCAN_PROFILE_NAMES, normalizePreviewScanProfile } from '../shared/previewScan'
import type { AppConfig } from '../shared/config'

type LegacyAppConfig = Partial<AppConfig> & {
  sandbox?: {
    defaultProfile?: string
  }
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function normalizePreviewProfile(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const normalized = normalizePreviewScanProfile(value.trim())
  return PREVIEW_SCAN_PROFILE_NAMES.includes(normalized) ? normalized : undefined
}

function normalizeConfig(raw: LegacyAppConfig): AppConfig {
  const previewDefault =
    normalizePreviewProfile(raw.preview?.defaultProfile) ??
    normalizePreviewProfile(raw.sandbox?.defaultProfile) ??
    DEFAULT_CONFIG.preview.defaultProfile
  return {
    ...DEFAULT_CONFIG,
    ai: { ...DEFAULT_CONFIG.ai, ...raw.ai },
    sdk: { ...DEFAULT_CONFIG.sdk, ...raw.sdk },
    preview: { ...DEFAULT_CONFIG.preview, ...raw.preview, defaultProfile: previewDefault },
    runtimeTools: { ...DEFAULT_CONFIG.runtimeTools, ...raw.runtimeTools },
    moduleCatalog: { ...DEFAULT_CONFIG.moduleCatalog, ...raw.moduleCatalog },
    git: { ...DEFAULT_CONFIG.git, ...raw.git },
    theme: typeof raw.theme === 'string' ? raw.theme : DEFAULT_CONFIG.theme
  }
}

export async function getConfig(): Promise<AppConfig> {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(configPath(), 'utf-8')) as LegacyAppConfig)
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function setConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const current = await getConfig()
  const next: AppConfig = {
    ...current,
    ...patch,
    ai: { ...current.ai, ...patch.ai },
    sdk: { ...current.sdk, ...patch.sdk },
    preview: { ...current.preview, ...patch.preview },
    runtimeTools: { ...current.runtimeTools, ...patch.runtimeTools },
    moduleCatalog: { ...current.moduleCatalog, ...patch.moduleCatalog },
    git: { ...current.git, ...patch.git }
  }
  const target = configPath()
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
