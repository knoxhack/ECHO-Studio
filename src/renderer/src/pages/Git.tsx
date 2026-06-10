import { useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import type { GitStatus, GitCommit, GitDiff, GitBranch } from '@shared/git'

export default function Git(): JSX.Element {
  const { activeProject } = useWorkspace()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<GitCommit[]>([])
  const [diff, setDiff] = useState<GitDiff[]>([])
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [remoteName, setRemoteName] = useState('origin')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const load = async () => {
    if (!activeProject) return
    const s = await window.studio.gitStatus(activeProject.path)
    if (s.ok && s.data) {
      setStatus(s.data)
      if (!s.data.isRepo) {
        setLog([]); setDiff([]); setBranches([]); setRemotes([])
        return
      }
      const [l, d, b, r] = await Promise.all([
        window.studio.gitLog(activeProject.path, 20),
        window.studio.gitDiff(activeProject.path),
        window.studio.gitBranch(activeProject.path),
        window.studio.gitRemote(activeProject.path)
      ])
      if (l.ok && l.data) setLog(l.data)
      if (d.ok && d.data) setDiff(d.data)
      if (b.ok && b.data) setBranches(b.data)
      if (r.ok && r.data) setRemotes(r.data)
    }
  }

  useEffect(() => { load() }, [activeProject])

  const initRepo = async () => {
    if (!activeProject) return
    setBusy(true)
    const res = await window.studio.gitInit(activeProject.path)
    setBusy(false)
    if (res.ok) { setToast('Git repository initialised.'); load() }
    else { setError(res.error || 'Failed to init repo.') }
  }

  const commit = async () => {
    if (!activeProject || !message.trim()) return
    setBusy(true)
    const res = await window.studio.gitCommit(activeProject.path, message.trim())
    setBusy(false)
    if (res.ok) { setMessage(''); setToast('Committed.'); load() }
    else { setError(res.error || 'Commit failed.') }
  }

  const viewDiff = async (filePath: string) => {
    if (!activeProject) return
    setSelectedFile(filePath)
    const res = await window.studio.gitDiff(activeProject.path, filePath)
    if (res.ok && res.data) setDiff(res.data)
  }

  const checkout = async (branch: string) => {
    if (!activeProject) return
    setBusy(true)
    const res = await window.studio.gitCheckout(activeProject.path, branch)
    setBusy(false)
    if (res.ok) { setToast(`Checked out ${branch}`); load() }
    else { setError(res.error || 'Checkout failed.') }
  }

  const createBranch = async () => {
    if (!activeProject || !newBranch.trim()) return
    setBusy(true)
    const res = await window.studio.gitCheckout(activeProject.path, newBranch.trim(), true)
    setBusy(false)
    if (res.ok) { setNewBranch(''); setToast(`Created branch ${newBranch.trim()}`); load() }
    else { setError(res.error || 'Branch creation failed.') }
  }

  const push = async () => {
    if (!activeProject) return
    setBusy(true)
    const current = branches.find((b) => b.current)?.name
    const res = await window.studio.gitPush(activeProject.path, 'origin', current)
    setBusy(false)
    if (res.ok) { setToast('Pushed.'); load() }
    else { setError(res.error || 'Push failed.') }
  }

  const pull = async () => {
    if (!activeProject) return
    setBusy(true)
    const current = branches.find((b) => b.current)?.name
    const res = await window.studio.gitPull(activeProject.path, 'origin', current)
    setBusy(false)
    if (res.ok) { setToast('Pulled.'); load() }
    else { setError(res.error || 'Pull failed.') }
  }

  const addRemote = async () => {
    if (!activeProject || !remoteName.trim() || !remoteUrl.trim()) return
    setBusy(true)
    const res = await window.studio.gitAddRemote(activeProject.path, remoteName.trim(), remoteUrl.trim())
    setBusy(false)
    if (res.ok) { setToast('Remote added.'); load() }
    else { setError(res.error || 'Add remote failed.') }
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <Page title="Version Control" subtitle="Track changes, commit snapshots, manage branches and remotes.">
      <ActiveBar />

      {error && (
        <div className="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="btn ghost" style={{ marginLeft: 10 }} onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      {toast && <div className="toast" style={{ position: 'static', marginBottom: 12 }}>{toast}</div>}

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Repository</h3>
          {status?.isRepo ? (
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>Branch: <b>{status.branch}</b></div>
              <div>Ahead: <b>{status.ahead}</b></div>
              <div>Behind: <b>{status.behind}</b></div>
              <div>Modified files: <b>{status.files.length}</b></div>
            </div>
          ) : (
            <div className="dim" style={{ fontSize: 13 }}>Not a Git repository yet.</div>
          )}
          {!status?.isRepo && (
            <button className="btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={initRepo}>
              {busy ? 'Initialising...' : 'Init Repository'}
            </button>
          )}
        </div>

        <div className="card">
          <h3>Commit</h3>
          {status?.isRepo ? (
            <>
              <label className="field">
                <span>Message</span>
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your changes..." onKeyDown={(e) => e.key === 'Enter' && commit()} />
              </label>
              <div className="btn-row">
                <button className="btn primary" disabled={busy || !message.trim() || status.files.length === 0} onClick={commit}>
                  {busy ? 'Committing...' : 'Commit All'}
                </button>
                <button className="btn" disabled={busy || !status.branch} onClick={push}>Push</button>
                <button className="btn" disabled={busy || !status.branch} onClick={pull}>Pull</button>
              </div>
            </>
          ) : (
            <div className="dim" style={{ fontSize: 13 }}>Initialise a repository to start committing.</div>
          )}
        </div>

        <div className="card">
          <h3>Branches</h3>
          {branches.length > 0 ? (
            <div style={{ maxHeight: 140, overflow: 'auto' }}>
              {branches.map((b) => (
                <div key={b.name} className="list-row" style={{ padding: '4px 8px', marginBottom: 4, background: b.current ? 'rgba(59,130,246,0.12)' : 'var(--bg-2)' }}>
                  <span style={{ fontSize: 12, flex: 1 }}>{b.name}</span>
                  {!b.current && <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => checkout(b.name)}>Checkout</button>}
                </div>
              ))}
            </div>
          ) : <div className="dim" style={{ fontSize: 13 }}>No branches found.</div>}
          {status?.isRepo && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <input placeholder="new-branch" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" disabled={busy} onClick={createBranch}>Create</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3>Modified Files</h3>
          {status && status.files.length > 0 ? (
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {status.files.map((f) => (
                <div key={f.path} className="list-row" style={{ background: selectedFile === f.path ? 'rgba(59,130,246,0.12)' : 'var(--bg-2)', cursor: 'pointer' }} onClick={() => viewDiff(f.path)}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, width: 24 }}>{f.status}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{f.path}</span>
                </div>
              ))}
            </div>
          ) : <div className="dim" style={{ fontSize: 13 }}>No uncommitted changes.</div>}
        </div>

        <div className="card">
          <h3>Diff</h3>
          {diff.length > 0 ? (
            <div className="code" style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {diff.map((d, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{d.path}</div>
                  <div style={{ fontSize: 11 }}>{d.diff}</div>
                </div>
              ))}
            </div>
          ) : <div className="dim" style={{ fontSize: 13 }}>Select a file to view its diff.</div>}
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3>Remotes</h3>
          {remotes.length > 0 ? (
            <div>
              {remotes.map((r) => (
                <div key={r.name} className="list-row" style={{ padding: '6px 10px', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
                  <span className="dim" style={{ fontSize: 12, flex: 1 }}>{r.url}</span>
                </div>
              ))}
            </div>
          ) : <div className="dim" style={{ fontSize: 13 }}>No remotes configured.</div>}
          {status?.isRepo && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <input placeholder="name" value={remoteName} onChange={(e) => setRemoteName(e.target.value)} style={{ width: 100 }} />
              <input placeholder="https://github.com/user/repo.git" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" disabled={busy} onClick={addRemote}>Add</button>
            </div>
          )}
        </div>

        {log.length > 0 && (
          <div className="card">
            <h3>Recent Commits</h3>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {log.map((c) => (
                <div className="list-row" key={c.hash} style={{ background: 'var(--bg-2)', alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, width: 80, color: 'var(--muted)' }}>{c.hash.slice(0, 7)}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{c.message}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}
