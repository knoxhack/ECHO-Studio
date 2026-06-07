import { NavLink } from 'react-router-dom'
import { NAV } from '../nav'

export function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>
          <span className="logo">ECHO</span> Addon Studio
        </h1>
        <p>Build addons, expansions &amp; custom content for the ECHO Platform.</p>
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
    </aside>
  )
}
