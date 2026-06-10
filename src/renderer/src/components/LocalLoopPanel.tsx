import type { LocalLoopStepStatus } from '@shared/localLoop'

function badgeClass(state: LocalLoopStepStatus['state']): string {
  if (state === 'ready') return 'ready'
  if (state === 'attention') return 'fixes'
  return 'local'
}

function stateLabel(state: LocalLoopStepStatus['state']): string {
  if (state === 'ready') return 'Ready'
  if (state === 'attention') return 'Needs attention'
  return 'Needs setup'
}

export function LocalLoopPanel({
  steps,
  title = 'Local Loop',
  nextStep,
  onNavigate
}: {
  steps: LocalLoopStepStatus[]
  title?: string
  nextStep?: LocalLoopStepStatus
  onNavigate: (route: string) => void
}): JSX.Element {
  const currentNextStep = nextStep ?? steps.find((step) => step.state !== 'ready')
  return (
    <div className="card">
      <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <h3>{title}</h3>
          <p className="dim" style={{ fontSize: 13, margin: 0 }}>
            Modules, workspace, preview, validation, then release assets.
          </p>
        </div>
        {currentNextStep && (
          <button className="btn primary" onClick={() => onNavigate(currentNextStep.route)}>
            {currentNextStep.actionLabel}
          </button>
        )}
      </div>
      {currentNextStep && (
        <div className={`issue ${currentNextStep.state === 'attention' ? 'WARNING' : 'INFO'}`}>
          <span className="lvl">NEXT</span>
          {currentNextStep.label}: {currentNextStep.detail}
        </div>
      )}
      {steps.map((step) => (
        <div className="list-row" key={step.id} style={{ padding: '9px 10px' }}>
          <span className={`badge ${badgeClass(step.state)}`}>{stateLabel(step.state)}</span>
          <div style={{ flex: 1 }}>
            <b>{step.label}</b>
            <div className="dim" style={{ fontSize: 12 }}>
              {step.detail}
            </div>
          </div>
          <button className="btn ghost" onClick={() => onNavigate(step.route)}>
            {step.actionLabel}
          </button>
        </div>
      ))}
    </div>
  )
}
