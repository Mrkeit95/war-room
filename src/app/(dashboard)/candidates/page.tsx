import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { uiBucket, type CanonicalStage } from '@/lib/stages'
import { tierDisplay } from '@/lib/candidates'
import CandidateLink from '@/components/CandidateLink'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  name: string
  region: string
  current_stage: CanonicalStage
  current_group_title: string | null
  tier: string | null
  assigned_manager: string | null
  monday_updated_at: string | null
  last_synced_at: string
}

type Filters = {
  manager?: string
  region?: string
  bucket?: string         // comma-separated supported: "pending,scheduled"
  stage?: string          // single canonical stage (e.g. "active", "pto", "promoted") — overrides bucket
  board?: string          // BOARD 1 / BOARD 2 / TRAINING BOARD / "none" for blank
  status?: 'pipeline' | 'offboarded' | 'all'
}

const VALID_STAGES = new Set<string>([
  'typeform','passed_typeform','pending_interview','scheduled_interview','pending_onboarding',
  'pending_week_1','week_1_training','week_2_training','week_3_training','training_board',
  'pool','standby','active','promoted','pto','offboarded',
])

const STAGES_BY_BUCKET: Record<string, CanonicalStage[]> = {
  typeform: ['typeform'],
  passed: ['passed_typeform'],
  pending: ['pending_interview'],
  scheduled: ['scheduled_interview', 'pending_onboarding'],
  training: ['pending_week_1', 'week_1_training', 'week_2_training', 'week_3_training', 'training_board'],
  standby: ['pool', 'standby'],
  active: ['active', 'promoted', 'pto'],
}

async function fetchCandidates(filters: Filters): Promise<{ rows: Row[]; lastSyncedAt: string | null; totalCount: number } | { error: string }> {
  try {
    const supabase = createAdminClient()
    let q = supabase
      .from('candidates')
      .select('id, name, region, current_stage, current_group_title, tier, assigned_manager, monday_updated_at, last_synced_at', { count: 'exact' })

    if (filters.status === 'offboarded') q = q.eq('current_stage', 'offboarded')
    else if (filters.status === 'all') { /* no filter */ }
    else q = q.neq('current_stage', 'offboarded')

    if (filters.manager) q = q.eq('assigned_manager', filters.manager)
    if (filters.region) q = q.eq('region', filters.region)
    if (filters.stage) {
      q = q.eq('current_stage', filters.stage)
    } else if (filters.bucket) {
      const bucketKeys = filters.bucket.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const stages: CanonicalStage[] = []
      for (const b of bucketKeys) {
        const s = STAGES_BY_BUCKET[b]
        if (s) stages.push(...s)
      }
      if (stages.length > 0) q = q.in('current_stage', stages)
    } else { /* no stage/bucket filter — show all of selected status */ }
    if (filters.board) {
      if (filters.board.toLowerCase() === 'none') q = q.is('board_assignment', null)
      else q = q.eq('board_assignment', filters.board)
    }

    q = q.order('monday_updated_at', { ascending: false, nullsFirst: false }).limit(500)
    const { data, error, count } = await q
    if (error) return { error: error.message }
    const lastSyncedAt = data && data.length > 0 ? data[0].last_synced_at : null
    return { rows: (data ?? []) as Row[], lastSyncedAt, totalCount: count ?? 0 }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function tierBadge(tier: string | null) {
  const d = tierDisplay(tier)
  if (!d) return <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>
  return (
    <div style={{
      display: 'inline-flex', padding: '3px 8px', borderRadius: 5,
      alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
      background: d.bg, color: d.color,
    }}>{d.label}</div>
  )
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ manager?: string; region?: string; bucket?: string; stage?: string; board?: string; status?: string }> }) {
  const params = await searchParams
  const statusRaw = params.status?.toLowerCase()
  const status: Filters['status'] = statusRaw === 'offboarded' || statusRaw === 'all' ? statusRaw : undefined
  const stageRaw = params.stage?.toLowerCase()
  const stage = stageRaw && VALID_STAGES.has(stageRaw) ? stageRaw : undefined
  // If filtering by a stage like 'offboarded' implicitly need status=all so the default pipeline filter doesn't exclude it
  const effectiveStatus: Filters['status'] = status ?? (stage === 'offboarded' ? 'offboarded' : undefined)
  const filters: Filters = {
    manager: params.manager?.trim() || undefined,
    region: params.region?.toUpperCase() || undefined,
    bucket: params.bucket?.toLowerCase() || undefined,
    stage,
    board: params.board?.trim() || undefined,
    status: effectiveStatus,
  }
  const result = await fetchCandidates(filters)
  const activeFilters = Object.entries(filters).filter(([, v]) => !!v) as [keyof Filters, string][]

  if ('error' in result) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Candidates</h1>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, marginTop: 28 }}>
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8, fontWeight: 500 }}>Failed to load candidates</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{result.error}</div>
        </div>
      </div>
    )
  }

  const { rows, lastSyncedAt, totalCount } = result
  const showing = rows.length
  const truncated = totalCount > showing

  const formatStage = (stage: CanonicalStage, group: string | null) => group ?? stage.replace(/_/g, ' ')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Candidates</h1>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            {truncated
              ? `Showing ${showing} of ${totalCount.toLocaleString()} candidates`
              : `${totalCount.toLocaleString()} ${totalCount === 1 ? 'candidate' : 'candidates'}`}
            {' · synced from Monday'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {lastSyncedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
              Last synced {new Date(lastSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <ViewToggle label="In pipeline" href={buildHref(params, { status: undefined })} active={!status} />
            <ViewToggle label="Offboarded" href={buildHref(params, { status: 'offboarded' })} active={status === 'offboarded'} />
            <ViewToggle label="All" href={buildHref(params, { status: 'all' })} active={status === 'all'} />
          </div>
        </div>
      </div>

      {/* Filter chip rows */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <FilterRow label="Region" options={[
          { label: 'All', value: undefined },
          { label: '🇵🇭 PH', value: 'PH' },
          { label: '🇪🇺 EU', value: 'EU' },
          { label: '🇧🇷 SA', value: 'SA' },
          { label: '🇬🇧 UK', value: 'UK' },
        ]} current={filters.region} hrefFor={(v) => buildFilterHref(filters, 'region', v)} />
        <FilterRow label="Stage" options={[
          { label: 'All', value: undefined },
          { label: 'Typeform', value: 'typeform' },
          { label: 'Passed', value: 'passed' },
          { label: 'Pending interview', value: 'pending' },
          { label: 'Scheduled interview', value: 'scheduled' },
          { label: 'Interviews (both)', value: 'pending,scheduled' },
          { label: 'Training', value: 'training' },
          { label: 'Standby', value: 'standby' },
          { label: 'Active', value: 'active' },
        ]} current={filters.bucket} hrefFor={(v) => buildFilterHref(filters, 'bucket', v)} />
        <FilterRow label="Board" options={[
          { label: 'All', value: undefined },
          { label: 'Board 1', value: 'BOARD 1' },
          { label: 'Board 2', value: 'BOARD 2' },
          { label: 'Board 3', value: 'BOARD 3' },
          { label: 'Training Board', value: 'TRAINING BOARD' },
          { label: 'No BOARD', value: 'none' },
        ]} current={filters.board} hrefFor={(v) => buildFilterHref(filters, 'board', v)} />
        {activeFilters.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500 }}>Active</span>
            {activeFilters.map(([key, value]) => (
              <span key={key} style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 4, fontWeight: 500, background: 'rgba(96,165,250,0.10)', color: 'var(--blue)' }}>
                {key}: {value}
              </span>
            ))}
            <Link href="/candidates" style={{ fontSize: 11.5, color: 'var(--text-3)', textDecoration: 'none', marginLeft: 'auto' }}>Clear all ×</Link>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No matches</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {activeFilters.length > 0 ? 'Try clearing filters.' : 'Trigger a sync to pull data from Monday.'}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tier', 'Name', 'Region', 'Stage', 'Manager', 'Bucket'].map(h => (
                  <th key={h} style={{ background: 'var(--surface-2)', padding: '12px 16px', textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const bucket = uiBucket(c.current_stage)
                return (
                  <tr key={c.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '14px 16px' }}>{tierBadge(c.tier)}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 500, fontSize: 13 }}>
                      <CandidateLink id={c.id}>{c.name}</CandidateLink>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 11 }}>{c.region}</span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{formatStage(c.current_stage, c.current_group_title)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                      {c.assigned_manager ? (
                        <Link href={`/candidates?manager=${encodeURIComponent(c.assigned_manager)}`} style={{ color: 'var(--text-2)', textDecoration: 'none', borderBottom: '1px dotted var(--border-strong)' }}>{c.assigned_manager}</Link>
                      ) : (
                        <span style={{ color: 'var(--text-4)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {bucket ? (
                        <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-3)', color: 'var(--text-2)', textTransform: 'capitalize' }}>{bucket}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ViewToggle({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 5, textDecoration: 'none', fontWeight: 500,
      background: active ? 'var(--surface-2)' : 'transparent',
      color: active ? 'var(--text)' : 'var(--text-3)',
      border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
    }}>{label}</Link>
  )
}

function buildHref(current: { manager?: string; region?: string; bucket?: string; board?: string; status?: string }, override: { status?: string | undefined }): string {
  const params = new URLSearchParams()
  if (current.manager) params.set('manager', current.manager)
  if (current.region) params.set('region', current.region)
  if (current.bucket) params.set('bucket', current.bucket)
  if (current.board) params.set('board', current.board)
  const status = 'status' in override ? override.status : current.status
  if (status) params.set('status', status)
  const qs = params.toString()
  return qs ? `/candidates?${qs}` : '/candidates'
}

function FilterRow({ label, options, current, hrefFor }: {
  label: string
  options: { label: string; value: string | undefined }[]
  current: string | undefined
  hrefFor: (value: string | undefined) => string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500, minWidth: 56 }}>{label}</span>
      {options.map(o => {
        const active = (current ?? '') === (o.value ?? '')
        return (
          <Link
            key={o.label}
            href={hrefFor(o.value)}
            style={{
              fontSize: 11.5, padding: '4px 10px', borderRadius: 5, textDecoration: 'none', fontWeight: 500,
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-3)',
              border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
            }}
          >{o.label}</Link>
        )
      })}
    </div>
  )
}

function buildFilterHref(current: { manager?: string; region?: string; bucket?: string; stage?: string; board?: string; status?: string }, key: 'manager' | 'region' | 'bucket' | 'stage' | 'board' | 'status', value: string | undefined): string {
  const params = new URLSearchParams()
  const next = { ...current, [key]: value }
  // Setting bucket clears stage (and vice versa) — they're mutually exclusive in the query
  if (key === 'bucket' && value) next.stage = undefined
  if (key === 'stage' && value) next.bucket = undefined
  if (next.manager) params.set('manager', next.manager)
  if (next.region) params.set('region', next.region)
  if (next.bucket) params.set('bucket', next.bucket)
  if (next.stage) params.set('stage', next.stage)
  if (next.board) params.set('board', next.board)
  if (next.status) params.set('status', next.status)
  const qs = params.toString()
  return qs ? `/candidates?${qs}` : '/candidates'
}
