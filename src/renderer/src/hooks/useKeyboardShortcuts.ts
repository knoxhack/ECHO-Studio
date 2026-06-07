import { useEffect } from 'react'

export function useKeyboardShortcuts(handlers: {
  onSave?: () => void
  onSearch?: () => void
  onRefresh?: () => void
  onNewProject?: () => void
  onHelp?: () => void
}): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey
      if (!isMeta) return
      // Don't intercept when user is typing in an input, textarea, or contenteditable.
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault()
          handlers.onSave?.()
          break
        case 'f':
          e.preventDefault()
          handlers.onSearch?.()
          break
        case 'r':
          e.preventDefault()
          handlers.onRefresh?.()
          break
        case 'n':
          e.preventDefault()
          handlers.onNewProject?.()
          break
        case '/':
          e.preventDefault()
          handlers.onHelp?.()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handlers.onSave, handlers.onSearch, handlers.onRefresh, handlers.onNewProject, handlers.onHelp])
}
