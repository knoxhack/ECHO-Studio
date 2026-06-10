import { NavLink } from 'react-router-dom'
import { NAV } from '../nav'

export function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>
          <span className="logo">ECHO</span> Studio
        </h1>
        <p>Design experiences, wire modules, validate locally, and ship release-ready builds.</p>
      </div>
      {NAV.map((group) => (
        <div className="nav-group" key={group.title}>
          <div className="nav-group-title">{group.title}</div>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="ico">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
      <div className="nav-group" style={{ marginTop: 'auto' }}>
        <div className="nav-group-title">Workspace Modes</div>
        <div className="mode-card">
          <b>Builder</b>
          <span>Visual-first creator tools</span>
        </div>
        <div className="mode-card">
          <b>Developer</b>
          <span>Gradle, clients, builds, logs</span>
        </div>
        <div className="mode-card">
          <b>Codex</b>
          <span>Tasks, diffs, approval gates</span>
        </div>
      </div>
    </aside>
  )
}
