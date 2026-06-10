interface RouteTarget {
  pattern: RegExp
  route: string
  label: string
}

const ROUTE_TARGETS: RouteTarget[] = [
  { pattern: /^missions\/[^/]+\.json$/, route: '/missions', label: 'Missions' },
  { pattern: /^recipes\/[^/]+\.json$/, route: '/recipes', label: 'Recipes' },
  { pattern: /^holomap\/[^/]+\.json$/, route: '/holomap', label: 'HoloMap' },
  { pattern: /^index\/[^/]+\.json$/, route: '/index', label: 'Index' },
  { pattern: /^screens\/[^/]+\.json$/, route: '/screens', label: 'Interface' },
  { pattern: /^content\/items\/[^/]+\.json$/, route: '/items', label: 'Items' },
  { pattern: /^content\/loot\/[^/]+\.json$/, route: '/loot', label: 'Loot' },
  { pattern: /^content\/dialogue\/[^/]+\.json$/, route: '/dialogue', label: 'Dialogue' },
  { pattern: /^lang\/[^/]+\.json$/, route: '/missions', label: 'Localization' },
  { pattern: /^echo\.mod\.json$/, route: '/experience', label: 'Experience' },
  { pattern: /^(\.echo-studio\/|settings\.gradle$|build\.gradle$|gradle\.properties$|gradlew(\.bat)?$|src\/|scripts\/)/, route: '/dev-workspace', label: 'Dev Workspace' },
  { pattern: /^(exports\/|release\/|META-INF\/)/, route: '/release', label: 'Release' }
]

export function normalizeProjectFilePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

export function editorTargetForProjectFile(path: string): { route: string; label: string } {
  const normalized = normalizeProjectFilePath(path)
  return ROUTE_TARGETS.find((target) => target.pattern.test(normalized)) ?? {
    route: '/content',
    label: 'Content Builder'
  }
}

export function editorRouteForProjectFile(path: string): string {
  return editorTargetForProjectFile(path).route
}

export function editorLabelForProjectFile(path: string): string {
  return editorTargetForProjectFile(path).label
}
