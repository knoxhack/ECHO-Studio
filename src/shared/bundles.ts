export interface BundleMember {
  id: string
  name: string
  version: string
  path: string
  hash: string
}

export interface ExperienceResult {
  path: string
  loadOrder: string[]
  members: BundleMember[]
  warnings: string[]
}

export interface ServerPackResult {
  zipPath: string
  requiredClientAddons: string[]
  warnings: string[]
  members: BundleMember[]
}
