import { useCallback, useEffect, useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { ActiveBar, NoProject } from '../components/ProjectPicker'
import { useWorkspace } from '../state/WorkspaceContext'
import { ECHO_MODULE_CATALOG, type EchoModuleRecord } from '@shared/moduleCatalog'
import { runPackOSCheck } from '@shared/validation'
import type { AddonManifest, IssueLevel, PackOSReport } from '@shared/types'

type ContractLevel = 'ERROR' | 'WARNING'

interface ContractIssue {
  level: ContractLevel
  category: string
  message: string
}

interface ParseResult {
  manifest?: AddonManifest
  issue?: ContractIssue
}

function parseManifest(raw: string): ParseResult {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        issue: {
          level: 'ERROR',
          category: 'JSON',
          message: 'Manifest must be a JSON object.'
        }
      }
    }
    return { manifest: parsed as AddonManifest }
  } catch (error) {
    return {
      issue: {
        level: 'ERROR',
        category: 'JSON',
        message: `Invalid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`
      }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function hasArray(value: unknown): boolean {
  return Array.isArray(value)
}

function validateManifestShape(manifest: AddonManifest): ContractIssue[] {
  const issues: ContractIssue[] = []
  const root = asRecord(manifest) ?? {}
  const publisher = asRecord(root.publisher)
  const target = asRecord(root.target)
  const runtime = asRecord(root.runtime)
  const dependencies = asRecord(root.dependencies)
  const trust = asRecord(root.trust)
  const support = asRecord(root.support)

  const requireText = (path: string, value: unknown): void => {
    if (!hasText(value)) {
      issues.push({
        level: 'ERROR',
        category: 'Contract',
        message: `Missing required text field: ${path}`
      })
    }
  }

  const requireArray = (path: string, value: unknown): void => {
    if (!hasArray(value)) {
      issues.push({
        level: 'ERROR',
        category: 'Contract',
        message: `Missing required array field: ${path}`
      })
    }
  }

  if (root.schemaVersion === undefined) {
    issues.push({
      level: 'WARNING',
      category: 'Contract',
      message: 'schemaVersion is missing. Studio can save this draft, but Release Index packaging expects an explicit contract version.'
    })
  }

  requireText('id', root.id)
  requireText('name', root.name)
  requireText('version', root.version)
  requireText('namespace', root.namespace)
  requireText('description', root.description)
  requireText('developerType', root.developerType)
  requireText('projectClass', root.projectClass)

  if (!publisher) {
    issues.push({ level: 'ERROR', category: 'Contract', message: 'Missing required object: publisher' })
  } else {
    requireText('publisher.id', publisher.id)
    requireText('publisher.name', publisher.name)
    requireText('publisher.type', publisher.type)
  }

  if (!target) {
    issues.push({ level: 'ERROR', category: 'Contract', message: 'Missing required object: target' })
  } else {
    requireArray('target.experiences', target.experiences)
    requireArray('target.modules', target.modules)
    if (Array.isArray(target.experiences) && target.experiences.length === 0) {
      issues.push({
        level: 'ERROR',
        category: 'Contract',
        message: 'target.experiences must contain at least one experience.'
      })
    }
  }

  if (!runtime) {
    issues.push({ level: 'ERROR', category: 'Contract', message: 'Missing required object: runtime' })
  } else {
    requireArray('runtime.supports', runtime.supports)
    requireText('runtime.nativeReadiness', runtime.nativeReadiness)
    requireText('runtime.minimumEchoSdk', runtime.minimumEchoSdk)
    if (Array.isArray(runtime.supports) && runtime.supports.length === 0) {
      issues.push({
        level: 'ERROR',
        category: 'Contract',
        message: 'runtime.supports must contain at least one runtime.'
      })
    }
  }

  requireArray('permissions', root.permissions)

  if (!dependencies) {
    issues.push({ level: 'ERROR', category: 'Contract', message: 'Missing required object: dependencies' })
  } else {
    requireArray('dependencies.required', dependencies.required)
    requireArray('dependencies.optional', dependencies.optional)
  }

  if (!trust) {
    issues.push({ level: 'ERROR', category: 'Contract', message: 'Missing required object: trust' })
  }

  if (!support) {
    issues.push({ level: 'ERROR', category: 'Contract', message: 'Missing required object: support' })
  } else {
    requireText('support.tier', support.tier)
  }

  return issues
}

function issueTone(level: IssueLevel | ContractLevel): string {
  if (level === 'BLOCKER') return 'var(--blocker)'
  if (level === 'ERROR') return 'var(--bad)'
  if (level === 'WARNING') return 'var(--warn)'
  if (level === 'INFO') return 'var(--info)'
  return 'var(--accent)'
}

function Metric({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone?: string
}): JSX.Element {
  return (
    <div className="card">
      <h3>{label}</h3>
      <div className="metric" style={{ fontSize: 22, color: tone }}>
        {value}
      </div>
    </div>
  )
}

export default function ManifestEditor(): JSX.Element {
  const { activeProject, refresh, toast } = useWorkspace()
  const [raw, setRaw] = useState('{}')
  const [savedRaw, setSavedRaw] = useState('{}')
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [contractIssues, setContractIssues] = useState<ContractIssue[]>([])
  const [report, setReport] = useState<PackOSReport | null>(null)
  const [catalog, setCatalog] = useState<EchoModuleRecord[]>(ECHO_MODULE_CATALOG)
  const [catalogLabel, setCatalogLabel] = useState('Built-in catalog')
  const [catalogWarnings, setCatalogWarnings] = useState<string[]>([])

  const loadManifest = useCallback(async () => {
    if (!activeProject) {
      setRaw('{}')
      setSavedRaw('{}')
      setDirty(false)
      setContractIssues([])
      setReport(null)
      return
    }

    setLoading(true)
    setStatus(null)

    let nextCatalog = ECHO_MODULE_CATALOG
    const catalogResult = await window.studio.listEchoModules(activeProject.path)
    if (catalogResult.ok && catalogResult.data) {
      nextCatalog = catalogResult.data.catalog
      setCatalog(nextCatalog)
      setCatalogWarnings(catalogResult.data.warnings)
      setCatalogLabel(catalogResult.data.source === 'local-index' ? 'Local ECHO-Modules index' : 'Built-in catalog')
    } else {
      setCatalog(ECHO_MODULE_CATALOG)
      setCatalogWarnings([catalogResult.error || 'Could not load local ECHO Modules catalog.'])
      setCatalogLabel('Built-in catalog')
    }

    const manifestResult = await window.studio.readManifest(activeProject.path)
    if (manifestResult.ok && manifestResult.data) {
      const nextRaw = JSON.stringify(manifestResult.data, null, 2)
      setRaw(nextRaw)
      setSavedRaw(nextRaw)
      setDirty(false)
      const nextReport = runPackOSCheck(manifestResult.data, nextCatalog)
      setReport(nextReport)
      setContractIssues(validateManifestShape(manifestResult.data))
    } else {
      setRaw('{}')
      setSavedRaw('{}')
      setDirty(false)
      setReport(null)
      setContractIssues([
        {
          level: 'ERROR',
          category: 'Load',
          message: manifestResult.error || 'Could not read echo.mod.json.'
        }
      ])
    }

    setLoading(false)
  }, [activeProject])

  useEffect(() => {
    void loadManifest()
  }, [loadManifest])

  const hasContractErrors = contractIssues.some((issue) => issue.level === 'ERROR')
  const parsedName = useMemo(() => {
    const parsed = parseManifest(raw)
    const name = parsed.manifest ? asRecord(parsed.manifest)?.name : null
    return (typeof name === 'string' && name.trim()) || activeProject?.manifest.name || 'Manifest'
  }, [activeProject, raw])

  const runDraftValidation = useCallback(
    (rawText = raw): AddonManifest | null => {
      const parsed = parseManifest(rawText)
      if (parsed.issue || !parsed.manifest) {
        setContractIssues(parsed.issue ? [parsed.issue] : [])
        setReport(null)
        setStatus('Fix JSON before saving.')
        return null
      }

      const shapeIssues = validateManifestShape(parsed.manifest)
      setContractIssues(shapeIssues)
      if (shapeIssues.some((issue) => issue.level === 'ERROR')) {
        setReport(null)
        setStatus('Fix required contract fields before saving.')
        return null
      }

      const draftReport = runPackOSCheck(parsed.manifest, catalog)
      setReport(draftReport)
      setStatus(draftReport.publishingReady ? 'Draft passes manifest PackOS checks.' : 'Draft has PackOS issues.')
      return parsed.manifest
    },
    [catalog, raw]
  )

  const onRawChange = (value: string): void => {
    setRaw(value)
    setDirty(value !== savedRaw)
    setStatus(null)
  }

  const formatRaw = (): void => {
    const parsed = parseManifest(raw)
    if (parsed.issue || !parsed.manifest) {
      setContractIssues(parsed.issue ? [parsed.issue] : [])
      setStatus('Fix JSON before formatting.')
      return
    }
    const nextRaw = JSON.stringify(parsed.manifest, null, 2)
    setRaw(nextRaw)
    setDirty(nextRaw !== savedRaw)
    setStatus('JSON formatted.')
  }

  const save = async (): Promise<void> => {
    if (!activeProject) return
    const manifest = runDraftValidation(raw)
    if (!manifest) {
      toast('Manifest has blocking contract issues')
      return
    }

    setSaving(true)
    const result = await window.studio.writeManifest(activeProject.path, manifest)
    if (!result.ok) {
      setSaving(false)
      setStatus(result.error || 'Save failed.')
      toast(result.error || 'Manifest save failed')
      return
    }

    const normalizedRaw = JSON.stringify(manifest, null, 2)
    setRaw(normalizedRaw)
    setSavedRaw(normalizedRaw)
    setDirty(false)
    await refresh()

    const fullCheck = await window.studio.fullCheck(activeProject.path)
    if (fullCheck.ok && fullCheck.data) {
      setReport(fullCheck.data)
    }

    setSaving(false)
    setStatus('Saved echo.mod.json and refreshed project checks.')
    toast('Manifest saved')
  }

  if (!activeProject) {
    return (
      <Page title="Manifest JSON" subtitle="Edit echo.mod.json directly when the guided Experience form is not enough.">
        <NoProject />
      </Page>
    )
  }

  return (
    <Page
      title="Manifest JSON"
      subtitle="Direct editing for the project contract, backed by PackOS and the active ECHO Modules catalog."
      actions={
        <>
          <button className="btn" disabled={loading || saving} onClick={formatRaw}>
            Format
          </button>
          <button className="btn" disabled={loading || saving} onClick={loadManifest}>
            Reload
          </button>
          <button className="btn" disabled={loading || saving} onClick={() => runDraftValidation()}>
            Validate
          </button>
          <button className="btn primary" disabled={loading || saving || !dirty} onClick={save}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <ActiveBar />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Metric
          label="Contract"
          value={hasContractErrors ? `${contractIssues.filter((issue) => issue.level === 'ERROR').length} error(s)` : 'Editable'}
          tone={hasContractErrors ? 'var(--bad)' : 'var(--good)'}
        />
        <Metric
          label="PackOS"
          value={report ? `${report.compatibilityScore}%` : 'Not run'}
          tone={report ? (report.publishingReady ? 'var(--good)' : 'var(--warn)') : 'var(--text-faint)'}
        />
        <Metric label="Modules" value={String(catalog.length)} tone="var(--accent)" />
        <Metric
          label="Save State"
          value={dirty ? 'Unsaved' : 'Saved'}
          tone={dirty ? 'var(--warn)' : 'var(--good)'}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge ready">{catalogLabel}</span>
          <span className="mono dim">{parsedName}</span>
          {status && <span className="dim">{status}</span>}
        </div>
        {catalogWarnings.length > 0 && (
          <div className="issue WARNING" style={{ marginTop: 10 }}>
            <span className="lvl">WARNING</span>
            {catalogWarnings.join(' ')}
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)', alignItems: 'start' }}>
        <div className="card">
          <h3>echo.mod.json</h3>
          <textarea
            className="mono"
            style={{ minHeight: 560, lineHeight: 1.55, resize: 'vertical' }}
            spellCheck={false}
            value={raw}
            onChange={(event) => onRawChange(event.target.value)}
          />
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Contract Check</h3>
            {contractIssues.length === 0 ? (
              <p className="dim" style={{ margin: 0 }}>
                No contract shape issues found.
              </p>
            ) : (
              contractIssues.map((issue, index) => (
                <div className={`issue ${issue.level}`} key={`${issue.message}-${index}`}>
                  <div>
                    <span className="lvl" style={{ color: issueTone(issue.level) }}>
                      {issue.level}
                    </span>
                    <span className="dim" style={{ fontSize: 11 }}>
                      {issue.category}
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>{issue.message}</div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>PackOS Preview</h3>
            {!report ? (
              <p className="dim" style={{ margin: 0 }}>
                Validate a structurally complete manifest to preview PackOS status.
              </p>
            ) : (
              <>
                <div className="btn-row" style={{ marginBottom: 12 }}>
                  {(['BLOCKER', 'ERROR', 'WARNING', 'SUGGESTION'] as const).map((level) => (
                    <span key={level} className="badge" style={{ color: issueTone(level) }}>
                      {level}: {report.counts[level]}
                    </span>
                  ))}
                </div>
                <div className="bar" style={{ marginBottom: 12 }}>
                  <span style={{ width: `${report.compatibilityScore}%` }} />
                </div>
                {report.issues.length === 0 ? (
                  <p className="dim" style={{ margin: 0 }}>
                    No PackOS issues found.
                  </p>
                ) : (
                  report.issues.map((issue, index) => (
                    <div className={`issue ${issue.level}`} key={`${issue.message}-${index}`}>
                      <div>
                        <span className="lvl">{issue.level}</span>
                        <span className="dim" style={{ fontSize: 11 }}>
                          {issue.category}
                        </span>
                      </div>
                      <div style={{ marginTop: 4 }}>{issue.message}</div>
                      {issue.fix && <div className="fix">Fix: {issue.fix}</div>}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Page>
  )
}
