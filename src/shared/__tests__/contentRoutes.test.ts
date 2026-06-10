import { describe, expect, it } from 'vitest'
import {
  editorLabelForProjectFile,
  editorRouteForProjectFile,
  normalizeProjectFilePath
} from '../content/routes'

describe('content route helpers', () => {
  it('normalizes Windows and relative project file paths', () => {
    expect(normalizeProjectFilePath('.\\recipes\\weather_core.json')).toBe('recipes/weather_core.json')
  })

  it('routes known content files to their focused editors', () => {
    expect(editorRouteForProjectFile('missions/first_contact.json')).toBe('/missions')
    expect(editorRouteForProjectFile('recipes/weather_core.json')).toBe('/recipes')
    expect(editorRouteForProjectFile('holomap/mission_markers.json')).toBe('/holomap')
    expect(editorRouteForProjectFile('index/weather_core_entry.json')).toBe('/index')
  })

  it('routes workspace and release files to their workflow screens', () => {
    expect(editorRouteForProjectFile('.echo-studio/modules.lock.json')).toBe('/dev-workspace')
    expect(editorLabelForProjectFile('exports/echo-release.json')).toBe('Release')
  })

  it('falls back to Content Builder for unknown project files', () => {
    expect(editorRouteForProjectFile('custom/data.json')).toBe('/content')
    expect(editorLabelForProjectFile('custom/data.json')).toBe('Content Builder')
  })
})
