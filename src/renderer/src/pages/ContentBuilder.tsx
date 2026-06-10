import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { FileNode } from '@shared/types'

export default function ContentBuilder(): JSX.Element {
  const { activeProject, toast } = useWorkspace()
  const [tree, setTree] = useState<FileNode | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')

  const loadTree = (): void => {
    if (!activeProject) return
    window.studio.readProjectTree(activeProject.path).then((r) => r.ok && setTree(r.data!))
  }

  useEffect(loadTree, [activeProject])

  if (!activeProject)
    return (
      <Page title="Content Builder" subtitle="The central editor for all your project content.">
        <NoProject />
      </Page>
    )

  const openF = async (path: string): Promise<void> => {
    const res = await window.studio.readFile(path)
    if (res.ok) {
      setOpenFile(path)
      setContent(res.data!)
      setDirty(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!openFile) return
    const res = await window.studio.writeFile(openFile, content)
    if (res.ok) {
      setDirty(false)
      toast('Saved')
    }
  }

  return (
    <Page
      title="Content Builder"
      subtitle="Browse and edit items, missions, recipes, screens, HoloMap layers, Index entries and assets."
      actions={
        <>
          <button className="btn" onClick={loadTree}>
            Refresh
          </button>
          <button className="btn primary" disabled={!dirty} onClick={save}>
            Save File
          </button>
        </>
      }
    >
      <div className="split">
        <div className="card" style={{ overflow: 'auto' }}>
          <div className="section-title" style={{ margin: '0 0 8px' }}>
            Content
          </div>
          <input
            placeholder="Filter files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div className="tree">{tree && <TreeView node={tree} onOpen={openF} depth={0} query={query.toLowerCase()} />}</div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          {openFile ? (
            <>
              <div className="mono dim" style={{ fontSize: 11, marginBottom: 8 }}>
                {openFile.split(/[\\/]/).pop()}
              </div>
              <textarea
                className="mono"
                style={{ flex: 1, minHeight: 420, background: 'var(--bg-0)' }}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setDirty(true)
                }}
              />
            </>
          ) : (
            <div className="empty">Select a file from the content tree to edit.</div>
          )}
        </div>

        <div className="card">
          <div className="section-title" style={{ margin: '0 0 8px' }}>
            Properties
          </div>
          <p className="dim" style={{ fontSize: 12 }}>
            {openFile ? 'Editing raw content. Specialized editors are available in Missions, Recipes, Screens, HoloMap and Index.' : 'No file selected.'}
          </p>
          <div className="section-title">AI Suggestions</div>
          <p className="dim" style={{ fontSize: 12 }}>
            Use the AI Assistant to generate missions, recipes, Index entries and more.
          </p>
        </div>
      </div>
    </Page>
  )
}

function TreeView({
  node,
  onOpen,
  depth,
  query
}: {
  node: FileNode
  onOpen: (p: string) => void
  depth: number
  query?: string
}): JSX.Element | null {
  const [open, setOpen] = useState(depth < 1 || !!query)
  const matches = (n: FileNode): boolean => {
    if (!query) return true
    if (n.name.toLowerCase().includes(query)) return true
    if (n.type === 'dir' && n.children?.some(matches)) return true
    return false
  }
  if (!matches(node)) return null

  if (node.type === 'file') {
    return (
      <div
        className="tree-node file"
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => onOpen(node.path)}
      >
        [file] {node.name}
      </div>
    )
  }
  const visibleChildren = node.children?.filter((c) => matches(c)) ?? []
  return (
    <div>
      <div
        className="tree-node"
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'v' : '>'} {node.name}
      </div>
      {open &&
        visibleChildren.map((c) => (
          <TreeView key={c.path} node={c} onOpen={onOpen} depth={depth + 1} query={query} />
        ))}
    </div>
  )
}
