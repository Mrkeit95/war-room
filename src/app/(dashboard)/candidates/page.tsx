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
  bucket?: string
}

async function fetchCandidates(filters: Filters): Promise<{ rows: Row[]; lastSyncedAt: string | null; totalCount: number } | { error: string }> {
  try {
    const supabase = createAdminClient()
    let q = supabase
      .from('candidates')
      .select('id, name, region, current_stage, current_group_title, tier, assigned_manager, monday_updated_at, last_synced_at', { count: 'exact' })
      .neq('current_stage', 'offboarded')

    if (filters.manager) q = q.eq('assigned_manager', filters.manager)
    if (filters.region) q = q.eq('region', filters.region)
    if (filters.bucket) {
      // Map bucket to canonical stages
      const stagesByBucket: Record<string, CanonicalStage[]> = {
        typeform: ['typeform'],
        passed: ['passed_typeform'],
        pending: ['pending_interview'],
        scheduled: ['scheduled_interview', 'pending_onboarding'],
        training: ['pending_week_1', 'week_1_training', 'week_2_training', 'week_3_training', 'training_board'],
        standby: ['pool', 'standby'],
        active: ['active', 'promoted', 'pto'],
      }
      const stages = stagesByBucket[filters.bucket]
      if (stages) q = q.in('current_stage', stages)
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

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ manager?: string; region?: string; bucket?: string }> }) {
  const params = await searchParams
  const filters: Filters = {
    manager: params.manager?.trim() || undefined,
    region: params.region?.toUpperCase() || undefined,
    bucket: params.bucket?.toLowerCase() || undefined,
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
        {lastSyncedAt && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
            Last synced {new Date(lastSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500 }}>Filtered by</span>
          {activeFilters.map(([key, value]) => (
            <span key={key} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 5, fontWeight: 500,
              background: 'rgba(96,165,250,0.10)', color: 'var(--blue)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {key}: {value}
            </span>
          ))}
          <Link href="/candidates" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', marginLeft: 4 }}>Clear all ×</Link>
        </div>
      )}

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
