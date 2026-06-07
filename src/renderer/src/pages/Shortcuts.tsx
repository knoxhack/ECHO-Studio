import { Page } from '../components/Page'

const SHORTCUTS = [
  { keys: 'Ctrl + S', action: 'Save current file / Apply primary action' },
  { keys: 'Ctrl + F', action: 'Focus search or filter input' },
  { keys: 'Ctrl + R', action: 'Refresh workspace projects' },
  { keys: 'Ctrl + N', action: 'Create new addon' },
  { keys: 'Ctrl + /', action: 'Open keyboard shortcuts help' },
  { keys: 'Esc', action: 'Close modal or dialog' }
]

export default function Shortcuts(): JSX.Element {
  return (
    <Page title="Keyboard Shortcuts" subtitle="Speed up your workflow with these global shortcuts.">
      <div className="grid cols-2">
        {SHORTCUTS.map((s) => (
          <div className="list-row" key={s.keys} style={{ background: 'var(--bg-2)' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, minWidth: 100 }}>{s.keys}</span>
            <span style={{ fontSize: 13 }}>{s.action}</span>
          </div>
        ))}
      </div>
    </Page>
  )
}
