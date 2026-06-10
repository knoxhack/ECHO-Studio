export interface NavItem {
  path: string
  label: string
  icon: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    title: 'Studio',
    items: [
      { path: '/', label: 'Home', icon: 'H' },
      { path: '/projects', label: 'Projects', icon: 'P' },
      { path: '/create', label: 'Create', icon: '+' },
      { path: '/experience', label: 'Experience', icon: 'E' }
    ]
  },
  {
    title: 'Build',
    items: [
      { path: '/modules', label: 'Modules', icon: 'M' },
      { path: '/dev-workspace', label: 'Dev Workspace', icon: 'D' },
      { path: '/assets', label: 'Assets', icon: 'A' },
      { path: '/gameplay', label: 'Gameplay', icon: 'G' },
      { path: '/missions', label: 'Missions', icon: 'Q' },
      { path: '/interface', label: 'Interface', icon: 'U' }
    ]
  },
  {
    title: 'Ship',
    items: [
      { path: '/preview', label: 'Preview', icon: 'P' },
      { path: '/validation', label: 'Validation', icon: 'V' },
      { path: '/release', label: 'Release', icon: 'R' }
    ]
  },
  {
    title: 'Assist',
    items: [
      { path: '/ai', label: 'Assistant', icon: 'A' },
      { path: '/codex', label: 'Codex Tasks', icon: 'C' }
    ]
  },
  {
    title: 'System',
    items: [
      { path: '/advanced', label: 'Advanced', icon: '>' },
      { path: '/settings', label: 'Settings', icon: 'S' }
    ]
  }
]

export const ROUTE_LABELS: Record<string, string> = {
  '/projects': 'Project Library',
  '/addons': 'Project Library',
  '/templates': 'Templates',
  '/manifest': 'Experience',
  '/manifest-editor': 'Manifest JSON',
  '/content': 'Content Builder',
  '/graph': 'Content Graph',
  '/recipes': 'Recipes',
  '/screens': 'Interface',
  '/holomap': 'HoloMap',
  '/index': 'Index',
  '/items': 'Items',
  '/loot': 'Loot',
  '/dialogue': 'Dialogue',
  '/packos': 'Validation',
  '/compatibility': 'Compatibility',
  '/submit': 'Release',
  '/publish-assistant': 'Release',
  '/releases': 'Release',
  '/catalog': 'Catalog',
  '/ecosystem': 'Ecosystem Builder',
  '/docs': 'Docs',
  '/examples': 'Examples',
  '/ai': 'ECHO Studio Assistant',
  '/git': 'Version Control',
  '/shortcuts': 'Shortcuts'
}

export function findLabel(path: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.path === path) return item.label
    }
  }
  return ROUTE_LABELS[path] ?? ''
}
