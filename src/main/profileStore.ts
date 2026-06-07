import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { DEFAULT_PROFILE } from '../shared/profile'
import type { CreatorProfile } from '../shared/profile'

function profilePath(): string {
  return join(app.getPath('userData'), 'profile.json')
}

export async function getProfile(): Promise<CreatorProfile> {
  try {
    const raw = JSON.parse(await fs.readFile(profilePath(), 'utf-8'))
    return { ...DEFAULT_PROFILE, ...raw, team: raw.team ?? [] }
  } catch {
    return DEFAULT_PROFILE
  }
}

export async function setProfile(patch: Partial<CreatorProfile>): Promise<CreatorProfile> {
  const current = await getProfile()
  const next = { ...current, ...patch }
  await fs.writeFile(profilePath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
