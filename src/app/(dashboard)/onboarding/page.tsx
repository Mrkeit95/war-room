import Link from 'next/link'
import { getOnboardingSnapshot, type ModelWithCapacity } from '@/lib/models'
import { getLastSyncedAt } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import SyncButton from './SyncButton'

export const dynamic = 'force-dynamic'

async function getModelDiagnostics() {
  const supabase = createAdminClient()
  const { count } = await supabase.from('models').select('id', { count: 'exact', head: true })
  const lastSync = await getLastSyncedAt()
  return {
    envVarSet: !!process.env.MONDAY_BOARD_ID_MODELS,
    boardId: process.env.MONDAY_BOARD_ID_MODELS ?? null,
    modelsInDb: count ?? 0,
    lastSyncedAt: lastSync,
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function revenueLabel(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n}`
}

function startLabel(date: string | null | undefined, days: number | null): string {
  if (!date) return '—'
  const d = new Date(date + 'T00:00:00Z')
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  const base = `${month} ${day}`
  if (days === null) return base
  if (days < 0) return `${base} · ${-days}d ago`
  if (days === 0) return `${base} · today`
  return `${base} · in ${days}d`
}

function dayChipColor(days: number | null): { bg: string; fg: string } {
  if (days === null) return { bg: 'var(--surface-3)', fg: 'var(--text-3)' }
  if (days < 0) return { bg: 'rgba(148,163,184,0.12)', fg: 'var(--text-3)' }
  if (days <= 3) return { bg: 'rgba(239,68,68,0.12)', fg: 'var(--red)' }
  if (days <= 7) return { bg: 'rgba(251,191,36,0.12)', fg: 'var(--amber)' }
  return { bg: 'rgba(96,165,250,0.10)', fg: 'var(--blue)' }
}

export default async function OnboardingPage() {
  let snapshot
  let diagnostics
  try {
    [snapshot, diagnostics] = await Promise.all([getOnboardingSnapshot(), getModelDiagnostics()])
  } catch (err) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Model onboarding</h1>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, fontSize: 12.5, color: 'var(--red)' }}>
          Failed to load: {err instanceof Error ? err.message : String(err)}
        </div>
      </div>
    )
  }

  const { models, totalChattersNeeded, availableStandby, coverage, shortBy } = snapshot
  const surplus = Math.max(0, availableStandby - totalChattersNeeded)
  const countable = models.filter(m => m.teamsNeeded > 0)
  const unpaired = models.filter(m => m.teamsNeeded === 0 && (m.revenue ?? 0) > 0)

  // Sort: countable models first (by start date asc), then unpaired
  countable.sort((a, b) => {
    if (a.daysUntilStart === null && b.daysUntilStart === null) return 0
    if (a.daysUntilStart === null) return 1
    if (b.daysUntilStart === null) return -1
    return a.daysUntilStart - b.daysUntilStart
  })

  const needsAttention = !diagnostics.envVarSet || diagnostics.modelsInDb === 0

  const activeGroupTitle = models[0]?.group_title ?? null

  return (
    <div>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Model onboarding</h1>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            Upcoming pages · capacity check against the global standby pool. Every $40k of revenue = 1 team of 4 chatters for 24h.
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 8, fontFamily: 'monospace' }}>
            {activeGroupTitle && <>Batch: <span style={{ color: 'var(--text-2)' }}>{activeGroupTitle}</span> · </>}
            Last synced {timeAgo(diagnostics.lastSyncedAt)} · {diagnostics.modelsInDb} total model{diagnostics.modelsInDb === 1 ? '' : 's'} in db
          </div>
        </div>
        <SyncButton subtle={!needsAttention} />
      </div>

      {/* Diagnostic banner — only shows when something is clearly wrong */}
      {!diagnostics.envVarSet && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--red)' }}>MONDAY_BOARD_ID_MODELS not set in Vercel</strong><br />
          Add this env var in Vercel → Settings → Environment Variables (Production scope):<br />
          <code style={{ background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace' }}>MONDAY_BOARD_ID_MODELS=8307745433</code> then redeploy.
        </div>
      )}
      {diagnostics.envVarSet && diagnostics.modelsInDb === 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.28)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--amber)' }}>No models in the database yet.</strong> Env var is set (board {diagnostics.boardId}) but the sync hasn&apos;t pulled anything.
          Hit <strong>Sync now</strong> above. If it fails, the error will tell us why — most likely the Monday API token doesn&apos;t have access to the chat-stars workspace.
        </div>
      )}

      {/* Coverage banner */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24,
      }}>
        <StatCard label="Pages onboarding" value={fmt(countable.length)} sub={unpaired.length > 0 ? `+${unpaired.length} sub-$40k (paired)` : undefined} />
        <StatCard label="Chatters needed" value={fmt(totalChattersNeeded)} sub={`${Math.ceil(totalChattersNeeded / 4)} teams`} />
        <StatCard label="Available standby" value={fmt(availableStandby)} sub="no board assigned" />
        {coverage === 'covered' ? (
          <StatCard label="Coverage" value={`+${fmt(surplus)}`} color="var(--green)" sub="surplus" />
        ) : (
          <StatCard label="Coverage" value={`-${fmt(shortBy)}`} color="var(--red)" sub={`short ${Math.ceil(shortBy / 4)} team${shortBy > 4 ? 's' : ''}`} />
        )}
      </div>

      {coverage === 'short' && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--red)' }}>Short by {shortBy} chatter{shortBy === 1 ? '' : 's'}</strong> ({Math.ceil(shortBy / 4)} team{shortBy === 1 ? '' : 's'}) to cover the upcoming pages.
          Either pull more from training, slow the onboarding cadence, or pair smaller pages. <Link href="/standby" style={{ color: 'var(--blue)' }}>View standby</Link> · <Link href="/pipeline" style={{ color: 'var(--blue)' }}>Pipeline</Link>
        </div>
      )}

      {/* Upcoming models — primary list */}
      <Panel title={`Upcoming · ${countable.length} ${countable.length === 1 ? 'page' : 'pages'} (≥ $40k)`} style={{ marginBottom: 14 }}>
        {countable.length === 0 ? (
          <div style={{ padding: '24px 4px', fontSize: 12.5, color: 'var(--text-4)', fontStyle: 'italic' }}>
            No upcoming pages of $40k or above. (Check the Monday board.)
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <HeaderRow />
            {countable.map((m, i) => (
              <ModelRow key={m.id} model={m} isLast={i === countable.length - 1} />
            ))}
          </div>
        )}
      </Panel>

      {/* Sub-$40k — informational */}
      {unpaired.length > 0 && (
        <Panel title={`Sub-$40k · ${unpaired.length} ${unpaired.length === 1 ? 'page' : 'pages'} · paired with others`} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
            These pages don&apos;t each get their own team — they share coverage with other pages. Not counted in the chatters-needed total above.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {unpaired.map((m, i) => (
              <ModelRow key={m.id} model={m} isLast={i === unpaired.length - 1} muted />
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function HeaderRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 0.8fr) minmax(0, 0.8fr) auto',
      gap: 14, padding: '10px 4px',
      borderBottom: '1px solid var(--border)',
      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 600,
    }}>
      <div>Model</div>
      <div>Start</div>
      <div>Revenue</div>
      <div>Board</div>
      <div>Teams</div>
      <div style={{ textAlign: 'right' }}>Chatters</div>
    </div>
  )
}

function ModelRow({ model, isLast, muted }: { model: ModelWithCapacity; isLast: boolean; muted?: boolean }) {
  const dayChip = dayChipColor(model.daysUntilStart)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 0.8fr) minmax(0, 0.8fr) auto',
      alignItems: 'center', gap: 14,
      padding: '14px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      opacity: muted ? 0.7 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[model.agency, model.page_type].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{
          display: 'inline-block', fontSize: 11.5, padding: '3px 9px', borderRadius: 4,
          background: dayChip.bg, color: dayChip.fg, fontWeight: 500,
          whiteSpace: 'nowrap',
        }}>{startLabel(model.start_date, model.daysUntilStart)}</span>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text)' }}>{revenueLabel(model.revenue)}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'monospace' }}>{model.board || <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>—</span>}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 13, color: model.teamsNeeded > 0 ? 'var(--text)' : 'var(--text-4)' }}>{model.teamsNeeded || '—'}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: model.chattersNeeded > 0 ? 'var(--blue)' : 'var(--text-4)', textAlign: 'right' }}>{model.chattersNeeded || '—'}</div>
    </div>
  )
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>{sub}</div>}
    </div>
  )
}

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', ...style }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}
