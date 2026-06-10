import {
  Bot,
  BookOpen,
  Boxes,
  CircleHelp,
  FileCode2,
  FolderOpen,
  Gamepad2,
  GitBranch,
  Home,
  Image,
  Keyboard,
  LayoutTemplate,
  Library,
  ListChecks,
  MapPinned,
  PackageCheck,
  PanelsTopLeft,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePlus,
  SquareTerminal,
  type LucideIcon
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { NAV, type NavIcon } from '../nav'

const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  assets: Image,
  assistant: Bot,
  catalog: Library,
  codex: ListChecks,
  content: FileCode2,
  create: SquarePlus,
  devWorkspace: SquareTerminal,
  experience: Sparkles,
  gameplay: Gamepad2,
  git: GitBranch,
  home: Home,
  index: BookOpen,
  interface: PanelsTopLeft,
  missions: MapPinned,
  modules: Boxes,
  preview: Play,
  projects: FolderOpen,
  release: PackageCheck,
  settings: Settings,
  shortcuts: Keyboard,
  templates: LayoutTemplate,
  validation: ShieldCheck
}

function NavItemIcon({ icon }: { icon: NavIcon }): JSX.Element {
  const Icon = NAV_ICONS[icon] ?? CircleHelp
  return <Icon aria-hidden="true" size={16} strokeWidth={2.1} />
}

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
              <span className="ico">
                <NavItemIcon icon={item.icon} />
              </span>
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
