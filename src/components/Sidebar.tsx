'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const navMain = [
  { route: '/', label: 'Dashboard', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
  )},
  { route: '/briefing', label: 'Morning briefing', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  )},
  { route: '/pipeline', label: 'Pipeline', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
  )},
  { route: '/candidates', label: 'Candidates', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  )},
  { route: '/calendar', label: 'Calendar', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
  )},
  { route: '/onboarding', label: 'Model onboarding', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>
  )},
]

const navDepts = [
  { route: '/departments/ph', label: 'Philippines', flag: '🇵🇭', count: 173 },
  { route: '/departments/eu', label: 'Europe', flag: '🇪🇺', count: 33 },
  { route: '/departments/sa', label: 'South America', flag: '🇧🇷', count: 29 },
  { route: '/departments/uk', label: 'United Kingdom', flag: '🇬🇧', count: 9 },
]

const navPool = [
  { route: '/standby', label: 'Standby', icon: '⏸' },
  { route: '/candidates?stage=active', label: 'Active', icon: '●' },
  { route: '/candidates?stage=pto', label: 'PTO', icon: '◐' },
  { route: '/candidates?stage=promoted', label: 'Promoted', icon: '↑' },
  { route: '/candidates?status=offboarded', label: 'Offboarded', icon: '✕' },
]

const navInsights = [
  { route: '/managers', label: 'Managers & shifts', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  )},
  { route: '/top-performers', label: 'Top performers', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="m22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  )},
  { route: '/at-risk', label: 'At risk', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  )},
  { route: '/activity', label: 'Activity log', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
  )},
]

export default function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isActive = (route: string) => {
    if (route === '/') return pathname === '/' && searchParams.toString() === ''
    // For routes with query string (e.g. /candidates?stage=active): require pathname + matching params
    const qIdx = route.indexOf('?')
    if (qIdx >= 0) {
      const routePath = route.slice(0, qIdx)
      if (pathname !== routePath) return false
      const routeParams = new URLSearchParams(route.slice(qIdx + 1))
      for (const [k, v] of routeParams) {
        if (searchParams.get(k) !== v) return false
      }
      return true
    }
    // Plain route: matches if pathname starts with it AND no conflicting query-string variant is active
    if (route === '/candidates') {
      // Special case: /candidates with stage/status filter should NOT highlight base /candidates
      return pathname === '/candidates' && !searchParams.get('stage') && !searchParams.get('status')
    }
    return pathname.startsWith(route)
  }

  return (
    <aside style={{
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
      padding: '24px 14px',
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      width: 240,
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '6px 12px 32px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.32em', lineHeight: 1 }}>WAR ROOM</div>
        <div style={{ height: 1, background: 'var(--border)', marginTop: 12 }} />
      </div>

      {/* Main nav */}
      <div style={{ marginBottom: 18 }}>
        {navMain.map(item => (
          <Link key={item.route} href={item.route} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 8,
              color: isActive(item.route) ? 'var(--text)' : 'var(--text-2)',
              fontSize: 13.5,
              background: isActive(item.route) ? 'var(--surface-2)' : 'transparent',
              border: `1px solid ${isActive(item.route) ? 'var(--border)' : 'transparent'}`,
              marginBottom: 2,
              cursor: 'pointer',
            }}>
              {item.icon}
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Departments */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', padding: '0 12px 8px', fontWeight: 500 }}>
          Departments
        </div>
        {navDepts.map(item => (
          <Link key={item.route} href={item.route} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 8,
              color: isActive(item.route) ? 'var(--text)' : 'var(--text-2)',
              fontSize: 13.5,
              background: isActive(item.route) ? 'var(--surface-2)' : 'transparent',
              border: `1px solid ${isActive(item.route) ? 'var(--border)' : 'transparent'}`,
              marginBottom: 2,
              cursor: 'pointer',
            }}>
              <span style={{ fontSize: 14 }}>{item.flag}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 10,
                background: 'var(--surface-3)', color: 'var(--text-2)',
                padding: '1px 7px', borderRadius: 10, fontWeight: 500,
                fontFamily: 'monospace',
              }}>{item.count}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Cross-region pool — chatters not tied to a specific region */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', padding: '0 12px 8px', fontWeight: 500 }}>
          Cross-region pool
        </div>
        {navPool.map(item => (
          <Link key={item.route} href={item.route} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 8,
              color: isActive(item.route) ? 'var(--text)' : 'var(--text-2)',
              fontSize: 13.5,
              background: isActive(item.route) ? 'var(--surface-2)' : 'transparent',
              border: `1px solid ${isActive(item.route) ? 'var(--border)' : 'transparent'}`,
              marginBottom: 2,
              cursor: 'pointer',
            }}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center', color: 'var(--text-3)' }}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Insights */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', padding: '0 12px 8px', fontWeight: 500 }}>
          Insights
        </div>
        {navInsights.map(item => (
          <Link key={item.route} href={item.route} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 8,
              color: isActive(item.route) ? 'var(--text)' : 'var(--text-2)',
              fontSize: 13.5,
              background: isActive(item.route) ? 'var(--surface-2)' : 'transparent',
              border: `1px solid ${isActive(item.route) ? 'var(--border)' : 'transparent'}`,
              marginBottom: 2,
              cursor: 'pointer',
            }}>
              {item.icon}
              <span>{item.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Settings */}
      <div style={{ marginBottom: 18 }}>
        <Link href="/settings" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 12px', borderRadius: 8,
            color: isActive('/settings') ? 'var(--text)' : 'var(--text-2)',
            fontSize: 13.5,
            background: isActive('/settings') ? 'var(--surface-2)' : 'transparent',
            border: `1px solid ${isActive('/settings') ? 'var(--border)' : 'transparent'}`,
            cursor: 'pointer',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/></svg>
            <span>Settings</span>
          </div>
        </Link>
      </div>

      {/* User */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, #4ade80, #60a5fa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: 'var(--bg)', flexShrink: 0,
        }}>N</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Operator</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Founder</div>
        </div>
      </div>
    </aside>
  )
}
