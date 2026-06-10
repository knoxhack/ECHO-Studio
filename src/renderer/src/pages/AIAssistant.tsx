import { useRef, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Page } from '../components/Page'
import { useWorkspace } from '../state/WorkspaceContext'
import type { AiFile } from '@shared/config'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  files?: AiFile[]
  usedModel?: boolean
}

interface AssistantRouteState {
  prefilled?: unknown
}

const SUGGESTIONS = [
  'Create a mission pack for Ashfall about a lost convoy.',
  'Generate a grinder recipe for ash alloy.',
  'Write a README and changelog for my project.',
  'How do I fix PackOS errors?'
]

export default function AIAssistant(): JSX.Element {
  const { activeProject, toast } = useWorkspace()
  const location = useLocation()
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: "I'm the ECHO Studio Assistant. I generate SDK-safe content namespaced to you and never bypass PackOS. Add an API key in Settings for full model-powered generation; otherwise I run offline."
    }
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [diff, setDiff] = useState<AiFile | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prefilled = (location.state as AssistantRouteState | null)?.prefilled
    if (prefilled) {
      if (typeof prefilled === 'string') send(prefilled)
      window.history.replaceState({}, document.title)
    }
  }, [])

  const send = async (text: string): Promise<void> => {
    const prompt = text.trim()
    if (!prompt || busy) return
    const history = [...messages, { role: 'user' as const, text: prompt }]
    setMessages(history)
    setInput('')
    setBusy(true)
    const res = await window.studio.aiChat(
      activeProject?.path ?? null,
      history.map((m) => ({ role: m.role, content: m.text }))
    )
    setBusy(false)
    if (res.ok && res.data) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: res.data!.text, files: res.data!.files, usedModel: res.data!.usedModel }
      ])
    } else {
      setMessages((m) => [...m, { role: 'assistant', text: res.error || 'AI error.' }])
    }
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const apply = async (files: AiFile[]): Promise<void> => {
    if (!activeProject) {
      toast('Select a project first')
      return
    }
    const res = await window.studio.aiApplyFiles(activeProject.path, files)
    if (res.ok) toast(`Applied ${res.data?.length ?? 0} file(s)`)
    else toast(res.error || 'Apply failed')
  }

  return (
    <Page
      title="ECHO Studio Assistant"
      subtitle="SDK-safe AI. Uses your configured model when an API key is set, otherwise runs offline."
    >
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6 }}>
          {messages.map((msg, i) => (
            <div className={`chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`} key={i}>
              <div className="chat-bubble">
                {msg.role === 'assistant' && msg.usedModel === false && (
                  <span className="badge local" style={{ marginBottom: 6, display: 'inline-block' }}>offline</span>
                )}
                <div>{msg.text}</div>
                {msg.files && msg.files.length > 0 && (
                  <>
                    <div className="code" style={{ marginTop: 10 }}>
                      {msg.files.map((f) => `+ ${f.path}`).join('\n')}
                    </div>
                    <div className="btn-row" style={{ marginTop: 10 }}>
                      <button className="btn primary" onClick={() => apply(msg.files!)}>
                        Apply Fix
                      </button>
                      <button className="btn ghost" onClick={() => setDiff(msg.files![0])}>
                        Review Diff
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="chat-msg ai"><div className="chat-bubble dim">Thinking...</div></div>}
          <div ref={endRef} />
        </div>

        {diff && (
          <div className="card" style={{ margin: '10px 0', background: 'var(--bg-2)' }}>
            <div style={{ display: 'flex' }}>
              <h3 style={{ flex: 1 }}>{diff.path}</h3>
              <button className="btn ghost" onClick={() => setDiff(null)}>Close</button>
            </div>
            <div className="code" style={{ maxHeight: 200 }}>{diff.content}</div>
          </div>
        )}

        <div className="btn-row" style={{ margin: '10px 0' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn ghost" style={{ fontSize: 11 }} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={input}
            placeholder="Ask the ECHO Studio Assistant..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
          />
          <button className="btn primary" disabled={busy} onClick={() => send(input)}>
            Send
          </button>
        </div>
      </div>
    </Page>
  )
}
