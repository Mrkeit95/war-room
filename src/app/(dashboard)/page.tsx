import Link from 'next/link'
import CandidateLink from '@/components/CandidateLink'
import Reminders from '@/components/Reminders'
import { getRegionPhase, phaseBg, phaseColor, phaseLabel } from '@/lib/rotation'
import { tierDisplay, TOP_PERFORMER_TIERS, type Region } from '@/lib/candidates'
import { getDashboardStats, getLastSyncedAt } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type CandidateSummary = {
  id: string
  name: string
  tier: string | null
  region: string
  current_group_title: string | null
  current_stage: string
  assigned_manager: string | null
  monday_updated_at: string | null
}

async function fetchTopPerformers(): Promise<CandidateSummary[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('candidates')
    .select('id, name, tier, region, current_group_title, current_stage, assigned_manager, monday_updated_at')
    .in('tier', TOP_PERFORMER_TIERS)
    .neq('current_stage', 'offboarded')
    .order('tier', { ascending: false })
    .order('monday_updated_at', { ascending: false, nullsFirst: false })
    .limit(5)
  return (data ?? []) as CandidateSummary[]
}

async function fetchRecentActivity(): Promise<CandidateSummary[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('candidates')
    .select('id, name, tier, region, current_group_title, current_stage, assigned_manager, monday_updated_at')
    .neq('current_stage', 'offboarded')
    .order('monday_updated_at', { ascending: false, nullsFirst: false })
    .limit(10)
  return (data ?? []) as CandidateSummary[]
}

async function fetchRegionTierCounts(): Promise<Record<Region, { strong: number; weak: number }>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('candidates')
    .select('region, tier')
    .neq('current_stage', 'offboarded')
    .limit(10000)
  const result: Record<Region, { strong: number; weak: number }> = {
    PH: { strong: 0, weak: 0 },
    EU: { strong: 0, weak: 0 },
    SA: { strong: 0, weak: 0 },
    UK: { strong: 0, weak: 0 },
  }
  // Tier 3/4 = strong, Tier 1/2 + EU 1 = weak (see memory/project_tier_scale.md)
  for (const row of (data ?? []) as { region: Region; tier: string | null }[]) {
    const t = row.tier?.toUpperCase()
    if (!t) continue
    if (t === 'TIER 3' || t === 'TIER 4' || t === 'A' || t === 'B') result[row.region].strong += 1
    else if (t === 'TIER 1' || t === 'TIER 2' || t === 'EU 1' || t === 'D' || t === 'F') result[row.region].weak += 1
  }
  return result
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null
  let lastSyncedAt: string | null = null
  let topPerformers: CandidateSummary[] = []
  let recentActivity: CandidateSummary[] = []
  let regionTiers: Awaited<ReturnType<typeof fetchRegionTierCounts>> | null = null
  let dataError: string | null = null
  try {
    ;[stats, lastSyncedAt, topPerformers, recentActivity, regionTiers] = await Promise.all([
      getDashboardStats(),
      getLastSyncedAt(),
      fetchTopPerformers(),
      fetchRecentActivity(),
      fetchRegionTierCounts(),
    ])
  } catch (err) {
    dataError = err instanceof Error ? err.message : String(err)
  }

  const phShare = stats ? (() => {
    const regionTotals = ['PH', 'EU', 'SA', 'UK'].map(r => {
      const b = stats!.byRegion[r as Region]
      return b.typeform + b.passed + b.pending + b.scheduled + b.training + b.standby + b.active
    })
    const total = regionTotals.reduce((a, b) => a + b, 0)
    return total > 0 ? Math.round((regionTotals[0] / total) * 100) : 0
  })() : 0

  const fmt = (n: number | undefined) => n === undefined ? '—' : n.toLocaleString()
  const heroCards = [
    { label: 'In pipeline', value: fmt(stats?.inPipeline), meta: 'across 4 regions', delta: '', pct: stats ? Math.min(100, Math.round(stats.inPipeline / 15)) : 78, color: 'var(--green)', href: '/pipeline' },
    { label: 'Interviews', value: fmt(stats?.interviews), meta: 'pending + scheduled', delta: '', pct: stats ? Math.min(100, Math.round(stats.interviews / 0.6)) : 64, color: 'var(--yellow)', deltaColor: 'var(--text-3)', href: '/?interviews=1' },
    { label: 'In training', value: fmt(stats?.inTraining), meta: 'across all weeks', delta: '', pct: stats ? Math.min(100, Math.round(stats.inTraining / 2.5)) : 85, color: 'var(--green)', deltaColor: 'var(--text-3)', href: '/pipeline' },
    { label: 'Active hires', value: fmt(stats?.activeHires), meta: 'active + promoted + PTO', delta: '', pct: stats ? Math.min(100, Math.round(stats.activeHires / 5)) : 92, color: 'var(--green)', href: '/pipeline' },
  ]

  return (
    <div>
      {dataError && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
          Couldn&apos;t load live data — showing fallback. ({dataError})
        </div>
      )}
      {!dataError && lastSyncedAt && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginBottom: 10 }}>
          Last sync {new Date(lastSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}
      {/* Hero metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        {heroCards.map((card) => (
          <Link key={card.label} href={card.href} scroll={!card.href.startsWith('/?')} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '22px 24px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500 }}>{card.label}</div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1 }}>{card.value}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{card.meta}</span>
                <span style={{ color: card.deltaColor || 'var(--green)', fontWeight: 500 }}>{card.delta}</span>
              </div>
              <div style={{ marginTop: 14, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: card.color, width: `${card.pct}%` }} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Department cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        {[
          { flag: '🇵🇭', name: 'Philippines', manager: 'Apple · Darla · Pauline', color: 'var(--amber)', slug: 'ph', region: 'PH' as Region },
          { flag: '🇪🇺', name: 'Europe', manager: 'Aleksandar', color: 'var(--green)', slug: 'eu', region: 'EU' as Region },
          { flag: '🇧🇷', name: 'South America', manager: 'Sebastien', color: 'var(--amber)', slug: 'sa', region: 'SA' as Region },
          { flag: '🇬🇧', name: 'United Kingdom', manager: 'Noah', color: 'var(--red)', slug: 'uk', region: 'UK' as Region },
        ].map((dept) => {
          const phase = getRegionPhase(dept.region)
          const buckets = stats?.byRegion[dept.region]
          const inPipeline = buckets ? buckets.typeform + buckets.passed + buckets.pending + buckets.scheduled + buckets.training + buckets.standby + buckets.active : 0
          const activeCount = buckets?.active ?? 0
          const trainingCount = buckets?.training ?? 0
          const strong = regionTiers?.[dept.region].strong ?? 0
          const weak = regionTiers?.[dept.region].weak ?? 0

          // Region's share of all in-pipeline (for the progress bar)
          const allInPipeline = stats?.inPipeline ?? 0
          const sharePct = allInPipeline > 0 ? Math.round((inPipeline / allInPipeline) * 100) : 0

          return (
          <Link key={dept.name} href={`/departments/${dept.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '20px 22px', cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>
                {dept.flag} {dept.name}
              </div>
              {phase && (
                <span style={{
                  fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                  padding: '2px 6px', borderRadius: 4,
                  background: phaseBg(phase), color: phaseColor(phase),
                }}>{phaseLabel(phase).replace(' week', '')}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{dept.manager}</div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, marginBottom: 4 }}>{inPipeline.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>in pipeline · {sharePct}% of total</div>
            <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ height: '100%', borderRadius: 2, background: dept.color, width: `${sharePct}%` }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 12 }}>
              {[
                { label: 'Active', value: activeCount.toLocaleString() },
                { label: 'Training', value: trainingCount.toLocaleString() },
                { label: 'Strong (T3–4)', value: strong.toLocaleString(), up: strong > 0 },
                { label: 'At risk (T1–2)', value: weak.toLocaleString(), down: weak > 0 },
              ].map(stat => (
                <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-3)' }}>{stat.label}</span>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 11,
                    color: stat.up ? 'var(--green)' : stat.down ? 'var(--red)' : 'var(--text)',
                  }}>{stat.value}</span>
                </div>
              ))}
            </div>
            </div>
          </Link>
          )
        })}
      </div>

      {/* Two column: recent activity + side panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        {/* Recent activity */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Recent activity</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>most recently updated in Monday</div>
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic', padding: '10px 0' }}>No activity to show yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentActivity.map(c => {
                const tier = tierDisplay(c.tier)
                const stage = c.current_group_title ?? c.current_stage.replace(/_/g, ' ')
                return (
                  <CandidateLink key={c.id} id={c.id} block>
                    <div style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                    }}>
                      {tier ? (
                        <div style={{
                          width: 36, height: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 10, fontFamily: 'monospace', flexShrink: 0,
                          background: tier.bg, color: tier.color,
                        }}>{tier.label}</div>
                      ) : (
                        <div style={{ width: 36, height: 24, borderRadius: 5, background: 'var(--surface-3)', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 10 }}>{c.region}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {stage}{c.assigned_manager ? ` · ${c.assigned_manager}` : ''}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', flexShrink: 0 }}>{timeAgo(c.monday_updated_at)}</div>
                    </div>
                  </CandidateLink>
                )
              })}
            </div>
          )}
        </div>

        {/* Side panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Reminders */}
          <Reminders />

          {/* Top performers */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Top performers</div>
              <Link href="/top-performers" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>View all →</Link>
            </div>
            {topPerformers.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic', padding: '6px 0' }}>
                No Tier 3 or Tier 4 candidates currently in the pipeline.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topPerformers.map((p, i) => {
                  const tier = tierDisplay(p.tier)
                  const stage = p.current_group_title ?? p.current_stage.replace(/_/g, ' ')
                  return (
                    <CandidateLink key={p.id} id={p.id} block>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-3)', width: 16, flexShrink: 0 }}>{i + 1}</div>
                        {tier ? (
                          <div style={{
                            width: 32, height: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 10, fontFamily: 'monospace', flexShrink: 0,
                            background: tier.bg, color: tier.color,
                          }}>{tier.label}</div>
                        ) : (
                          <div style={{ width: 32, height: 24, borderRadius: 5, background: 'var(--surface-3)', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 10, marginRight: 5 }}>{p.region}</span>
                            {stage}
                          </div>
                        </div>
                      </div>
                    </CandidateLink>
                  )
                })}
              </div>
            )}
          </div>

          {/* Source mix */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Source mix · PH share</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Target 25%</div>
            </div>
            <div style={{
              fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, marginBottom: 6,
              color: phShare > 50 ? 'var(--red)' : phShare > 30 ? 'var(--amber)' : 'var(--green)',
            }}>{phShare}%</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
              {phShare > 25 ? `${phShare - 25} points above target` : phShare < 25 ? `${25 - phShare} points below target` : 'on target'}
            </div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: phShare > 50 ? 'var(--red)' : phShare > 30 ? 'var(--amber)' : 'var(--green)',
                width: `${Math.min(100, phShare)}%`,
              }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
