import { Navigate, Routes, Route, useNavigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { useWorkspace } from './state/WorkspaceContext'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

import Dashboard from './pages/Dashboard'
import MyAddons from './pages/MyAddons'
import CreateAddon from './pages/CreateAddon'
import Templates from './pages/Templates'
import ManifestBuilder from './pages/ManifestBuilder'
import ManifestEditor from './pages/ManifestEditor'
import Modules from './pages/Modules'
import DevWorkspace from './pages/DevWorkspace'
import Gameplay from './pages/Gameplay'
import PublishAssistant from './pages/PublishAssistant'
import ContentBuilder from './pages/ContentBuilder'
import ContentGraph from './pages/ContentGraph'
import Missions from './pages/Missions'
import Recipes from './pages/Recipes'
import Screens from './pages/Screens'
import HoloMap from './pages/HoloMap'
import IndexBuilder from './pages/IndexBuilder'
import Items from './pages/Items'
import Loot from './pages/Loot'
import DialogueBuilder from './pages/Dialogue'
import Assets from './pages/Assets'
import Preview from './pages/Preview'
import Validation from './pages/Validation'
import Compatibility from './pages/Compatibility'
import CommunityCatalog from './pages/CommunityCatalog'
import Ecosystem from './pages/Ecosystem'
import Docs from './pages/Docs'
import Examples from './pages/Examples'
import AIAssistant from './pages/AIAssistant'
import CodexTasks from './pages/CodexTasks'
import Git from './pages/Git'
import Shortcuts from './pages/Shortcuts'
import Settings from './pages/Settings'

export default function App(): JSX.Element {
  const { toastMsg, refresh } = useWorkspace()
  const nav = useNavigate()
  useKeyboardShortcuts({
    onSave: () => document.querySelector<HTMLButtonElement>('button.btn.primary')?.click(),
    onSearch: () => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder*="Filter"], input[placeholder*="Search"]')
      input?.focus()
    },
    onRefresh: () => refresh(),
    onNewProject: () => nav('/create'),
    onHelp: () => nav('/shortcuts')
  })
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        <div className="content">
          <RouteErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<MyAddons />} />
              <Route path="/addons" element={<MyAddons />} />
              <Route path="/create" element={<CreateAddon />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/experience" element={<ManifestBuilder />} />
              <Route path="/manifest" element={<ManifestBuilder />} />
              <Route path="/manifest-editor" element={<ManifestEditor />} />
              <Route path="/modules" element={<Modules />} />
              <Route path="/dev-workspace" element={<DevWorkspace />} />
              <Route path="/gameplay" element={<Gameplay />} />
              <Route path="/publish-assistant" element={<PublishAssistant />} />
              <Route path="/content" element={<ContentBuilder />} />
              <Route path="/graph" element={<ContentGraph />} />
              <Route path="/missions" element={<Missions />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/interface" element={<Screens />} />
              <Route path="/screens" element={<Screens />} />
              <Route path="/holomap" element={<HoloMap />} />
              <Route path="/index" element={<IndexBuilder />} />
              <Route path="/items" element={<Items />} />
              <Route path="/loot" element={<Loot />} />
              <Route path="/dialogue" element={<DialogueBuilder />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/preview" element={<Preview />} />
              <Route path="/validation" element={<Validation />} />
              <Route path="/packos" element={<Validation />} />
              <Route path="/compatibility" element={<Compatibility />} />
              <Route path="/submit" element={<Navigate to="/release" replace />} />
              <Route path="/release" element={<PublishAssistant />} />
              <Route path="/releases" element={<PublishAssistant />} />
              <Route path="/catalog" element={<CommunityCatalog />} />
              <Route path="/ecosystem" element={<Ecosystem />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/examples" element={<Examples />} />
              <Route path="/codex" element={<CodexTasks />} />
              <Route path="/ai" element={<AIAssistant />} />
              <Route path="/git" element={<Git />} />
              <Route path="/advanced" element={<ContentBuilder />} />
              <Route path="/shortcuts" element={<Shortcuts />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </RouteErrorBoundary>
        </div>
      </div>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  )
}
