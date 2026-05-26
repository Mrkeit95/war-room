import Link from 'next/link'
import CandidateLink from '@/components/CandidateLink'
import { tierDisplay } from '@/lib/candidates'
import { createAdminClient } from '@/lib/supabase/admin'
import { aeForBoard, BOARD_TO_AE } from '@/lib/manager_sections'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  name: string
  region: string
  tier: string | null
  current_stage: string
  current_group_title: string | null
  assigned_manager: string | null
  page_assignment: string | null
  board_assignment: string | null
  current_stage_entered_at: string | null
  monday_updated_at: string | null
}

async function fetchStandby(): Promise<{ rows: Row[] } | { error: string }> {
  try {
    const supabase = createAdminClient()
    const PAGE = 1000
    const all: Row[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, name, region, tier, current_stage, current_group_title, assigned_manager, page_assignment, board_assignment, current_stage_entered_at, monday_updated_at')
        .eq('current_stage', 'standby')
        .range(from, from + PAGE - 1)
      if (error) return { error: error.message }
      if (!data || data.length === 0) break
      all.push(...(data as Row[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    return { rows: all }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function hoursIn(iso: string | null, fallback: string | null): number {
  const t = iso ? new Date(iso).getTime() : fallback ? new Date(fallback).getTime() : 0
  if (!t) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 3_600_000))
}

function timeLabel(hours: number): string {
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export default async function StandbyPage() {
  const result = await fetchStandby()

  if ('error' in result) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Standby</h1>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, fontSize: 12.5, color: 'var(--red)' }}>
          Failed to load: {result.error}
        </div>
      </div>
    )
  }

  const rows = result.rows
    .map(r => ({ row: r, hours: hoursIn(r.current_stage_entered_at, r.monday_updated_at) }))
    .sort((a, b) => b.hours - a.hours)

  const noBoardRows = rows.filter(r => !r.row.board_assignment?.trim())
  const noPageRows = rows.filter(r => r.row.board_assignment?.trim() && !r.row.page_assignment?.trim())
  const settled = rows.filter(r => r.row.board_assignment?.trim() && r.row.page_assignment?.trim())

  const criticalCount = noBoardRows.filter(r => r.hours >= 48).length
  const warningCount = noBoardRows.filter(r => r.hours >= 24 && r.hours < 48).length

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Standby</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          {rows.length} chatters in the global ready-pool · cross-region landing zone
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total in standby" value={rows.length} />
        <StatCard label="No BOARD assigned" value={noBoardRows.length} color={noBoardRows.length > 0 ? 'var(--amber)' : 'var(--text)'} />
        <StatCard label="Critical (48h+)" value={criticalCount} color={criticalCount > 0 ? 'var(--red)' : 'var(--text)'} />
        <StatCard label="Warning (24h+)" value={warningCount} color={warningCount > 0 ? 'var(--amber)' : 'var(--text)'} />
      </div>

      {/* AE board summary */}
      <Panel title="By BOARD · AE ownership" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {Object.entries(BOARD_TO_AE).map(([board, ae]) => {
            const count = rows.filter(r => r.row.board_assignment?.trim().toUpperCase() === board).length
            return (
              <BoardTile key={board} board={board} ae={ae} count={count} href={`/candidates?board=${encodeURIComponent(board)}`} />
            )
          })}
          <BoardTile board="No BOARD yet" ae="(all AEs / Keit)" count={noBoardRows.length} tone="warn" href="/candidates?bucket=standby&board=none" />
        </div>
      </Panel>

      {/* Unassigned to BOARD — most urgent */}
      {noBoardRows.length > 0 && (
        <Panel title={`No BOARD yet · ${noBoardRows.length} ${noBoardRows.length === 1 ? 'chatter' : 'chatters'}`} style={{ marginBottom: 14, borderColor: 'rgba(239,68,68,0.18)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {noBoardRows.map((r, i) => <StandbyRow key={r.row.id} row={r.row} hours={r.hours} isLast={i === noBoardRows.length - 1} />)}
          </div>
        </Panel>
      )}

      {/* BOARD assigned but no page yet */}
      {noPageRows.length > 0 && (
        <Panel title={`BOARD set · waiting on page · ${noPageRows.length}`} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {noPageRows.map((r, i) => <StandbyRow key={r.row.id} row={r.row} hours={r.hours} isLast={i === noPageRows.length - 1} />)}
          </div>
        </Panel>
      )}

      {/* Settled — board + page assigned, awaiting kickoff */}
      {settled.length > 0 && (
        <Panel title={`Page + BOARD assigned · ${settled.length} ready`}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {settled.slice(0, 30).map((r, i) => <StandbyRow key={r.row.id} row={r.row} hours={r.hours} isLast={i === Math.min(settled.length, 30) - 1} />)}
            {settled.length > 30 && (
              <Link href="/candidates?bucket=standby" style={{
                fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', padding: '10px 0',
                fontStyle: 'italic', textDecoration: 'none', display: 'block', marginTop: 4,
              }}>
                +{settled.length - 30} more — see full candidates list →
              </Link>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: color || 'var(--text)' }}>{value.toLocaleString()}</div>
    </div>
  )
}

function BoardTile({ board, ae, count, tone, href }: { board: string; ae: string; count: number; tone?: 'warn'; href?: string }) {
  const inner = (
    <div style={{
      background: 'var(--surface-2)', border: `1px solid ${tone === 'warn' && count > 0 ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`,
      borderRadius: 8, padding: '14px 12px',
      cursor: href ? 'pointer' : 'default', height: '100%',
    }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 6 }}>{board}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ae}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1, color: tone === 'warn' && count > 0 ? 'var(--amber)' : 'var(--text)' }}>{count.toLocaleString()}</div>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link> : inner
}

function StandbyRow({ row, hours, isLast }: { row: Row; hours: number; isLast: boolean }) {
  const tier = tierDisplay(row.tier)
  const hasBoard = !!row.board_assignment?.trim()
  const hasPage = !!row.page_assignment?.trim()
  const ae = aeForBoard(row.board_assignment)
  const sev: 'critical' | 'warning' | 'ok' = !hasBoard && hours >= 48 ? 'critical' : !hasBoard && hours >= 24 ? 'warning' : 'ok'
  const timeColor = sev === 'critical' ? 'var(--red)' : sev === 'warning' ? 'var(--amber)' : 'var(--text-3)'

  return (
    <CandidateLink id={row.id} block>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1.5fr) minmax(0, 1.4fr) minmax(0, 1.4fr) auto auto',
        alignItems: 'center', gap: 14,
        padding: '12px 4px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }}>
        {tier ? (
          <div style={{ width: 34, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, fontFamily: 'monospace', background: tier.bg, color: tier.color }}>{tier.label}</div>
        ) : (
          <div style={{ width: 34, height: 22, borderRadius: 4, background: 'var(--surface-3)' }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', marginRight: 6 }}>{row.region}</span>
            {row.current_group_title}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          {hasBoard ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{row.board_assignment}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{ae ?? '—'}</div>
            </>
          ) : (
            <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: 'var(--amber)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>No BOARD</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          {hasPage ? (
            <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' }}>{row.page_assignment}</span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-4)', fontStyle: 'italic' }}>no page</span>
          )}
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: timeColor, whiteSpace: 'nowrap' }}>{timeLabel(hours)}</span>
        {sev === 'critical' ? (
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(239,68,68,0.10)', color: 'var(--red)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Critical</span>
        ) : sev === 'warning' ? (
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(251,191,36,0.12)', color: 'var(--amber)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Warn</span>
        ) : <span />}
      </div>
    </CandidateLink>
  )
}

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', ...style }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}
