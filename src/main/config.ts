import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { DEFAULT_CONFIG } from '../shared/config'
import type { AppConfig } from '../shared/config'

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export async function getConfig(): Promise<AppConfig> {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf-8'))
    // Merge with defaults so new fields appear for old configs.
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      ai: { ...DEFAULT_CONFIG.ai, ...raw.ai },
      sdk: { ...DEFAULT_CONFIG.sdk, ...raw.sdk },
      sandbox: { ...DEFAULT_CONFIG.sandbox, ...raw.sandbox },
      git: { ...DEFAULT_CONFIG.git, ...raw.git }
    }
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
    sandbox: { ...current.sandbox, ...patch.sandbox },
    git: { ...current.git, ...patch.git }
  }
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
