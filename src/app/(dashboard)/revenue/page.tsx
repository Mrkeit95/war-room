import Link from 'next/link'
import { getActiveCreatorCount, getBoardSummary, getTopCreators, getLastSyncedAt, type BoardSummaryRow, type TopCreator } from '@/lib/db'
import { slugifyBoard } from '@/lib/boards'

export const dynamic = 'force-dynamic'

function fmtMoney(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null) return '—'
  if (opts.compact && n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (opts.compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString()}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(2)}%`
}

function pctColor(pct: number | null | undefined): string {
  if (pct == null) return 'var(--text-2)'
  if (pct >= 0.8) return 'var(--green)'
  if (pct >= 0.6) return 'var(--blue)'
  if (pct >= 0.4) return 'var(--amber)'
  return 'var(--red)'
}

export default async function RevenuePage() {
  let summary: Awaited<ReturnType<typeof getBoardSummary>>
  let topCreators: TopCreator[]
  let activeCount: number
  let syncedAt: string | null
  try {
    [summary, topCreators, activeCount, syncedAt] = await Promise.all([
      getBoardSummary(),
      getTopCreators(5),
      getActiveCreatorCount(),
      getLastSyncedAt(),
    ])
  } catch (err) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Revenue tracker</h1>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, fontSize: 12.5, color: 'var(--red)' }}>
          Failed to load: {err instanceof Error ? err.message : String(err)}
        </div>
      </div>
    )
  }

  const totals = summary.totals
  const boards = summary.boards
  const mtdRevenue = totals?.runningSales ?? boards.reduce((s, b) => s + (b.runningSales ?? 0), 0)
  const mtdGoal = totals?.goal ?? boards.reduce((s, b) => s + (b.goal ?? 0), 0)
  const mtdPctToGoal = totals?.pctToGoal ?? (mtdGoal > 0 ? mtdRevenue / mtdGoal : 0)

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Revenue tracker</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Month-to-date performance against goal · synced from Stellar OPS revenue tracker
          {syncedAt && <> · <span style={{ fontFamily: 'monospace' }}>last sync {new Date(syncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></>}
        </div>
      </div>

      {/* Top KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard
          label="MTD Revenue"
          accent="$"
          value={fmtMoney(mtdRevenue)}
          color="var(--green)"
          progressPct={mtdPctToGoal}
          progressLabel={`${Math.round(mtdPctToGoal * 100)}% of ${fmtMoney(mtdGoal)} goal`}
          progressRight={`${(mtdPctToGoal * 100).toFixed(1)}%`}
        />
        <KpiCard label="Active Creators" accent="ppl" value={activeCount.toLocaleString()} />
        <KpiCard label="Open Leads" accent="ppl" value="0" subtext="leads pipeline not yet wired" />
        <KpiCard label="Outstanding" accent="$" value="$0" subtext="billing not yet wired" />
      </div>

      {/* Per-board cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {boards.map(b => <BoardCard key={b.boardName} board={b} />)}
      </div>

      {/* Top creators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 14 }}>
        <Panel
          title="Top creators"
          right={<Link href="/boards" style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none' }}>View all →</Link>}
        >
          {topCreators.length === 0 ? (
            <div style={{ padding: '24px 4px', fontSize: 13, color: 'var(--text-4)', fontStyle: 'italic' }}>
              No creator revenue synced yet. Hit Sync now on /onboarding.
            </div>
          ) : (() => {
            const maxRev = Math.max(...topCreators.map(c => c.runningSales ?? 0), 1)
            return (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {topCreators.map((c, i) => (
                  <CreatorRow key={c.pageName} index={i + 1} creator={c} maxRev={maxRev} />
                ))}
              </div>
            )
          })()}
        </Panel>

        <Panel title="Upcoming">
          <div style={{ padding: '24px 4px', fontSize: 13, color: 'var(--text-4)', fontStyle: 'italic' }}>
            Calendar integration not wired yet.
          </div>
        </Panel>
      </div>
    </div>
  )
}

function KpiCard({ label, value, accent, color, subtext, progressPct, progressLabel, progressRight }: {
  label: string; value: string; accent?: string; color?: string; subtext?: string
  progressPct?: number; progressLabel?: string; progressRight?: string
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
        {accent && <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'monospace' }}>{accent}</div>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
      {progressPct !== undefined ? (
        <>
          <div style={{
            marginTop: 16, height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, progressPct * 100))}%`, height: '100%',
              background: pctColor(progressPct),
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'monospace' }}>
            <span>{progressLabel}</span>
            <span>{progressRight}</span>
          </div>
        </>
      ) : subtext ? (
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 14, fontStyle: 'italic' }}>{subtext}</div>
      ) : null}
    </div>
  )
}

function BoardCard({ board }: { board: BoardSummaryRow }) {
  const pct = board.pctToGoal ?? 0
  return (
    <Link href={`/boards/${slugifyBoard(board.boardName)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '18px 20px', cursor: 'pointer', height: '100%',
      }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{board.boardName}</div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: pctColor(pct), marginBottom: 4 }}>
          {board.pctToGoal != null ? `${(board.pctToGoal * 100).toFixed(2)}%` : '—'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>of goal</div>
        <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{
            width: `${Math.min(100, Math.max(0, pct * 100))}%`, height: '100%',
            background: pctColor(pct),
          }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
          <StatLine label="Running" value={fmtMoney(board.runningSales)} />
          <StatLine label="Ratio" value={board.ratio != null ? board.ratio.toFixed(2) : '—'} />
          <StatLine
            label="MoM"
            value={board.momPct != null
              ? `${board.momPct >= 0 ? '↑' : '↓'} ${(Math.abs(board.momPct) * 100).toFixed(2)}%`
              : '—'}
            color={board.momPct == null ? undefined : board.momPct >= 0 ? 'var(--green)' : 'var(--red)'}
          />
        </div>
      </div>
    </Link>
  )
}

function StatLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )
}

function CreatorRow({ index, creator, maxRev }: { index: number; creator: TopCreator; maxRev: number }) {
  const rev = creator.runningSales ?? 0
  const widthPct = Math.min(100, (rev / maxRev) * 100)
  const initials = creator.pageName.split(/\s+/).slice(0, 2).map(s => s[0] ?? '').join('').toUpperCase().slice(0, 2)
  // Color the bar per board tier
  const barColor =
    creator.boardName === 'BOARD 1' ? 'var(--green)' :
    creator.boardName === 'BOARD 2' ? 'var(--blue)' :
    creator.boardName === 'BOARD 3' ? 'var(--amber)' :
    creator.boardName === 'TRAINING BOARD' ? 'var(--violet)' :
    'var(--text-2)'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr) auto', alignItems: 'center', gap: 14,
      padding: '12px 4px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)', width: 14 }}>{index}</div>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--surface-3)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, color: 'var(--text-2)',
      }}>{initials}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creator.pageName}</div>
        <div style={{ marginTop: 6, height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${widthPct}%`, height: '100%', background: barColor }} />
        </div>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmtMoney(rev)}</div>
    </div>
  )
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}
