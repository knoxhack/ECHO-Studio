import { useCallback, useEffect, useState } from 'react'
import type { ContentRecord, ContentType } from '@shared/content/schemas'
import { useWorkspace } from './WorkspaceContext'

interface UseContent {
  records: ContentRecord[]
  loading: boolean
  reload: () => Promise<void>
  save: (item: { id: string }) => Promise<void>
  remove: (record: ContentRecord) => Promise<void>
}

// Load/save a single content type for the active project.
export function useContent(type: ContentType): UseContent {
  const { activeProject, toast } = useWorkspace()
  const [records, setRecords] = useState<ContentRecord[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!activeProject) {
      setRecords([])
      return
    }
    setLoading(true)
    const res = await window.studio.listContent(activeProject.path, type)
    setLoading(false)
    if (res.ok && res.data) setRecords(res.data)
  }, [activeProject, type])

  useEffect(() => {
    reload()
  }, [reload])

  const save = useCallback(
    async (item: { id: string }) => {
      if (!activeProject) {
        toast('Select a project first')
        return
      }
      const res = await window.studio.writeContent(activeProject.path, type, item)
      if (res.ok) {
        toast('Saved')
        await reload()
      } else toast(res.error || 'Save failed')
    },
    [activeProject, type, reload, toast]
  )

  const remove = useCallback(
    async (record: ContentRecord) => {
      const res = await window.studio.deleteContent(record.path)
      if (res.ok) {
        toast('Deleted')
        await reload()
      }
    },
    [reload, toast]
  )

  return { records, loading, reload, save, remove }
}
