import type { DeveloperRole } from './types'

export interface TeamMember {
  name: string
  role: DeveloperRole
}

export interface CreatorProfile {
  creatorName: string
  namespace: string
  role: DeveloperRole
  verified: boolean
  verifiedBy?: string
  website?: string
  team: TeamMember[]
}

export const DEFAULT_PROFILE: CreatorProfile = {
  creatorName: 'Team Nova',
  namespace: 'teamnova',
  role: 'addon_developer',
  verified: false,
  team: []
}

export const ROLE_LABELS: Record<DeveloperRole, string> = {
  addon_developer: 'Addon Developer',
  verified_addon_developer: 'Verified Addon Developer',
  pack_maker: 'Community Pack Maker',
  server_owner: 'Server Owner',
  tester: 'Tester'
}

// Capabilities unlocked per role (drives UI affordances).
export function roleCaps(profile: CreatorProfile): {
  analytics: boolean
  featuredEligible: boolean
  serverExport: boolean
  experienceBundler: boolean
  betaSdk: boolean
} {
  const verified = profile.verified || profile.role === 'verified_addon_developer'
  return {
    analytics: verified,
    featuredEligible: verified,
    serverExport: profile.role === 'server_owner' || verified,
    experienceBundler: profile.role === 'pack_maker' || verified,
    betaSdk: verified
  }
}
