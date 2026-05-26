import Link from 'next/link'
import CandidateLink from '@/components/CandidateLink'
import Reminders from '@/components/Reminders'
import { getRegionPhase, phaseBg, phaseColor, phaseLabel } from '@/lib/rotation'
import { tierDisplay, TOP_PERFORMER_TIERS, type Region } from '@/lib/candidates'
import { getCurrentAlerts, getDashboardStats, getLastSyncedAt, type Alert } from '@/lib/db'
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

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null
  let lastSyncedAt: string | null = null
  let topPerformers: CandidateSummary[] = []
  let alerts: Alert[] = []
  let regionTiers: Awaited<ReturnType<typeof fetchRegionTierCounts>> | null = null
  let dataError: string | null = null
  try {
    ;[stats, lastSyncedAt, topPerformers, alerts, regionTiers] = await Promise.all([
      getDashboardStats(),
      getLastSyncedAt(),
      fetchTopPerformers(),
      getCurrentAlerts(),
      fetchRegionTierCounts(),
    ])
  } catch (err) {
    dataError = err instanceof Error ? err.message : String(err)
  }

  const critical = alerts.filter(a => a.severity === 'critical')
  const warning = alerts.filter(a => a.severity === 'warning')
  const info = alerts.filter(a => a.severity === 'info')

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

      {/* Two column: action feed + side panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        {/* Action feed — rule-derived alerts */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Today · What needs you</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{alerts.length} {alerts.length === 1 ? 'item' : 'items'}</div>
          </div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-4)', fontStyle: 'italic', padding: '10px 0' }}>
              Nothing flagged. No weak candidates in advanced training, no long-idle items, no bottlenecks.
            </div>
          ) : (
            <>
              {critical.length > 0 && <AlertGroup label="Critical" accent="var(--red)" alerts={critical} />}
              {warning.length > 0 && <AlertGroup label="Warning" accent="var(--amber)" alerts={warning} />}
              {info.length > 0 && <AlertGroup label="Spotlight" accent="var(--yellow)" alerts={info} />}
            </>
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

const ALERT_VISIBLE_PER_GROUP = 8

function AlertGroup({ label, accent, badgeBg, alerts }: { label: string; accent: string; badgeBg?: string; alerts: Alert[] }) {
  const bg = badgeBg ?? (accent === 'var(--red)' ? 'rgba(239,68,68,0.10)' : accent === 'var(--amber)' ? 'rgba(251,191,36,0.10)' : 'rgba(253,224,71,0.10)')
  const visible = alerts.slice(0, ALERT_VISIBLE_PER_GROUP)
  const overflow = alerts.length - visible.length
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px' }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'monospace' }}>{alerts.length} {alerts.length === 1 ? 'item' : 'items'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {visible.map(a => {
          const inner = (
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px',
              display: 'flex', gap: 14, alignItems: 'flex-start',
              borderLeft: `2px solid ${accent}`,
              cursor: a.candidateId ? 'pointer' : 'default',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3, lineHeight: 1.4 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.meta}</div>
              </div>
              <span style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500,
                padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
                background: bg, color: accent,
              }}>{label}</span>
            </div>
          )
          return a.candidateId
            ? <CandidateLink key={a.id} id={a.candidateId} block>{inner}</CandidateLink>
            : <div key={a.id}>{inner}</div>
        })}
        {overflow > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center', padding: '6px 0', fontStyle: 'italic' }}>
            +{overflow} more {label.toLowerCase()} {overflow === 1 ? 'item' : 'items'}
          </div>
        )}
      </div>
    </>
  )
}
