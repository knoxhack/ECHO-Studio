export type NavIcon =
  | 'assets'
  | 'assistant'
  | 'catalog'
  | 'codex'
  | 'content'
  | 'create'
  | 'devWorkspace'
  | 'experience'
  | 'gameplay'
  | 'git'
  | 'home'
  | 'index'
  | 'interface'
  | 'missions'
  | 'modules'
  | 'preview'
  | 'projects'
  | 'release'
  | 'settings'
  | 'shortcuts'
  | 'templates'
  | 'validation'

export interface NavItem {
  path: string
  label: string
  icon: NavIcon
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    title: 'Start',
    items: [
      { path: '/', label: 'Home', icon: 'home' },
      { path: '/projects', label: 'Projects', icon: 'projects' },
      { path: '/create', label: 'Create', icon: 'create' },
      { path: '/templates', label: 'Templates', icon: 'templates' },
      { path: '/experience', label: 'Experience', icon: 'experience' }
    ]
  },
  {
    title: 'Build',
    items: [
      { path: '/modules', label: 'Modules', icon: 'modules' },
      { path: '/dev-workspace', label: 'Dev Workspace', icon: 'devWorkspace' },
      { path: '/content', label: 'Content', icon: 'content' },
      { path: '/assets', label: 'Assets', icon: 'assets' }
    ]
  },
  {
    title: 'Author',
    items: [
      { path: '/gameplay', label: 'Gameplay', icon: 'gameplay' },
      { path: '/missions', label: 'Missions', icon: 'missions' },
      { path: '/interface', label: 'Interface', icon: 'interface' },
      { path: '/index', label: 'Index', icon: 'index' }
    ]
  },
  {
    title: 'Ship',
    items: [
      { path: '/preview', label: 'Preview', icon: 'preview' },
      { path: '/validation', label: 'Validation', icon: 'validation' },
      { path: '/release', label: 'Release', icon: 'release' },
      { path: '/catalog', label: 'Catalog', icon: 'catalog' }
    ]
  },
  {
    title: 'Assist',
    items: [
      { path: '/ai', label: 'Assistant', icon: 'assistant' },
      { path: '/codex', label: 'Codex Tasks', icon: 'codex' }
    ]
  },
  {
    title: 'System',
    items: [
      { path: '/git', label: 'Version Control', icon: 'git' },
      { path: '/settings', label: 'Settings', icon: 'settings' },
      { path: '/shortcuts', label: 'Shortcuts', icon: 'shortcuts' }
    ]
  }
]

export const ROUTE_LABELS: Record<string, string> = {
  '/projects': 'Project Library',
  '/addons': 'Project Library',
  '/templates': 'Templates',
  '/manifest': 'Experience',
  '/manifest-editor': 'Manifest JSON',
  '/advanced': 'Content Builder',
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
