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

async function fetchCandidates(): Promise<{ rows: Row[]; lastSyncedAt: string | null } | { error: string }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('candidates')
      .select('id, name, region, current_stage, current_group_title, tier, assigned_manager, monday_updated_at, last_synced_at')
      .neq('current_stage', 'offboarded')
      .order('last_synced_at', { ascending: false })
      .limit(500)
    if (error) return { error: error.message }
    const lastSyncedAt = data && data.length > 0 ? data[0].last_synced_at : null
    return { rows: (data ?? []) as Row[], lastSyncedAt }
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

export default async function CandidatesPage() {
  const result = await fetchCandidates()

  if ('error' in result) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Candidates</h1>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, marginTop: 28 }}>
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8, fontWeight: 500 }}>Failed to load candidates</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{result.error}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 16 }}>
            Likely the database schema is not applied yet, or the sync hasn&apos;t run. Apply the migration in <code>supabase/migrations/0001_initial_schema.sql</code> and trigger a sync.
          </div>
        </div>
      </div>
    )
  }

  const { rows, lastSyncedAt } = result

  if (rows.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Candidates</h1>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, marginTop: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No candidates yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Trigger a sync to pull data from Monday — POST to <code style={{ fontFamily: 'monospace' }}>/api/sync</code> with the cron secret.
          </div>
        </div>
      </div>
    )
  }

  const formatStage = (stage: CanonicalStage, group: string | null) => {
    return group ?? stage.replace(/_/g, ' ')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Candidates</h1>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            {rows.length} candidates · synced from Monday
          </div>
        </div>
        {lastSyncedAt && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
            Last synced {new Date(lastSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>

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
                  <td style={{ padding: '14px 16px', fontWeight: 500, fontSize: 13 }}>{c.name}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 11 }}>{c.region}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{formatStage(c.current_stage, c.current_group_title)}</td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>{c.assigned_manager ?? <span style={{ color: 'var(--text-4)' }}>—</span>}</td>
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
    </div>
  )
}
