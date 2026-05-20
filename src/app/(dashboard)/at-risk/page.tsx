import CandidateLink from '@/components/CandidateLink'
import { tierDisplay } from '@/lib/candidates'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const AT_RISK_TIERS = ['D', 'F', 'TIER 3', 'TIER 4']

type Row = {
  id: string
  name: string
  region: string
  current_stage: string
  current_group_title: string | null
  tier: string | null
  assigned_manager: string | null
}

async function fetchAtRisk(): Promise<{ rows: Row[] } | { error: string }> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('candidates')
      .select('id, name, region, current_stage, current_group_title, tier, assigned_manager')
      .in('tier', AT_RISK_TIERS)
      .neq('current_stage', 'offboarded')
      .order('tier', { ascending: false })
      .order('monday_updated_at', { ascending: false, nullsFirst: false })
      .limit(100)
    if (error) return { error: error.message }
    return { rows: (data ?? []) as Row[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export default async function AtRiskPage() {
  const result = await fetchAtRisk()

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>At risk</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Tier 3 + Tier 4 candidates currently in the pipeline</div>
      </div>

      {'error' in result ? (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, fontSize: 12.5, color: 'var(--red)' }}>
          Failed to load: {result.error}
        </div>
      ) : result.rows.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Nobody at risk</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            No candidates are currently graded Tier 3 or Tier 4 in the pipeline.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {result.rows.map((c, i) => (
            <RiskRow key={c.id} candidate={c} isLast={i === result.rows.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function RiskRow({ candidate, isLast }: { candidate: Row; isLast: boolean }) {
  const tier = tierDisplay(candidate.tier)
  const stage = candidate.current_group_title ?? candidate.current_stage.replace(/_/g, ' ')
  return (
    <CandidateLink id={candidate.id} block>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }}>
        {tier ? (
          <div style={{
            width: 36, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
            background: tier.bg, color: tier.color, flexShrink: 0,
          }}>{tier.label}</div>
        ) : (
          <div style={{ width: 36, height: 28, borderRadius: 6, background: 'var(--surface-3)', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{candidate.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 10.5, marginRight: 6 }}>{candidate.region}</span>
            {stage}{candidate.assigned_manager ? ` · ${candidate.assigned_manager}` : ''}
          </div>
        </div>
      </div>
    </CandidateLink>
  )
}
