export interface NavItem {
  path: string
  label: string
  icon: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

// Grouped sidebar navigation matching the ECHO Addon Studio spec.
export const NAV: NavGroup[] = [
  {
    title: 'Home',
    items: [
      { path: '/', label: 'Dashboard', icon: '◎' },
      { path: '/addons', label: 'My Addons', icon: '▤' },
      { path: '/create', label: 'Create Addon', icon: '＋' }
    ]
  },
  {
    title: 'Build',
    items: [
      { path: '/templates', label: 'Templates', icon: '▦' },
      { path: '/manifest', label: 'Manifest Builder', icon: '⚙' },
      { path: '/manifest-editor', label: 'Manifest Editor', icon: '✎' },
      { path: '/content', label: 'Content Builder', icon: '◧' },
      { path: '/graph', label: 'Content Graph', icon: '⋔' },
      { path: '/missions', label: 'Missions', icon: '➤' },
      { path: '/recipes', label: 'Recipes', icon: '⚗' },
      { path: '/screens', label: 'Screens', icon: '▭' },
      { path: '/holomap', label: 'HoloMap', icon: '◍' },
      { path: '/index', label: 'Index', icon: '☰' },
      { path: '/items', label: 'Items', icon: '◇' },
      { path: '/loot', label: 'Loot', icon: '⚂' },
      { path: '/dialogue', label: 'Dialogue', icon: '💬' },
      { path: '/assets', label: 'Assets', icon: '◆' }
    ]
  },
  {
    title: 'Test',
    items: [
      { path: '/sandbox', label: 'Test Sandbox', icon: '▶' },
      { path: '/packos', label: 'PackOS Check', icon: '✓' },
      { path: '/compatibility', label: 'Compatibility', icon: '⇄' }
    ]
  },
  {
    title: 'Publish',
    items: [
      { path: '/submit', label: 'Submit Addon', icon: '⇪' },
      { path: '/publish-assistant', label: 'Publish Assistant', icon: '➤' },
      { path: '/releases', label: 'Releases', icon: '◷' },
      { path: '/catalog', label: 'Community Catalog', icon: '★' }
    ]
  },
  {
    title: 'Ecosystem',
    items: [
      { path: '/ecosystem', label: 'Ecosystem Builder', icon: '⚯' }
    ]
  },
  {
    title: 'Learn',
    items: [
      { path: '/docs', label: 'Docs', icon: '❒' },
      { path: '/examples', label: 'Examples', icon: '✦' },
      { path: '/ai', label: 'AI Assistant', icon: '✶' }
    ]
  },
  {
    title: 'System',
    items: [
      { path: '/git', label: 'Version Control', icon: '⚭' },
      { path: '/shortcuts', label: 'Shortcuts', icon: '⌨' },
      { path: '/settings', label: 'Settings', icon: '⚙' }
    ]
  }
]

export function findLabel(path: string): string {
  for (const g of NAV) {
    for (const i of g.items) if (i.path === path) return i.label
  }
  return ''
}
