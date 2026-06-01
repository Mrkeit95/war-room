'use client'

import { usePathname } from 'next/navigation'
import TopbarSyncButton from './TopbarSyncButton'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/briefing': 'Morning briefing',
  '/pipeline': 'Pipeline',
  '/candidates': 'Candidates',
  '/calendar': 'Calendar',
  '/departments/ph': 'Philippines',
  '/departments/eu': 'Europe',
  '/departments/sa': 'South America',
  '/departments/uk': 'United Kingdom',
  '/standby': 'Standby',
  '/managers': 'Managers & shifts',
  '/top-performers': 'Top performers',
  '/at-risk': 'At risk',
  '/activity': 'Activity log',
  '/settings': 'Settings',
}

export default function Topbar() {
  const pathname = usePathname()
  const title = pageTitles[pathname] || 'War Room'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 32px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--canvas)',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.005em' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Search */}
        <div style={{ position: 'relative', width: 280 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-3)', pointerEvents: 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search candidates…"
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '8px 12px 8px 34px',
              borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
        {/* Sync button — global, syncs everything */}
        <TopbarSyncButton />
      </div>
    </div>
  )
}
