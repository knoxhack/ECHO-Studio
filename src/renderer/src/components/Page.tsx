import type { ReactNode } from 'react'

export function Page({
  title,
  subtitle,
  actions,
  children
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <div>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="btn-row">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

// A placeholder for screens that are functional stubs in this build.
export function Stub({ note }: { note: string }): JSX.Element {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <p className="dim" style={{ margin: 0 }}>
        {note}
      </p>
    </div>
  )
}
