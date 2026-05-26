import Link from 'next/link'
import SegmentLink from '@/components/SegmentLink'
import CandidateLink from '@/components/CandidateLink'
import { getRegionPhase, phaseBg, phaseColor, phaseLabel } from '@/lib/rotation'
import { tierDisplay, type Region } from '@/lib/candidates'
import { getRegionStats, getStaleCandidates, type GroupSummary, type ManagerSummary, type StaleCandidate } from '@/lib/db'
import { uiBucket } from '@/lib/stages'
import {
  OVERSEERS,
  REGION_SOLE_OWNER,
  displayName,
  getAllSectionManagerNames,
  getConfiguredManagerCount,
  getSectionManagers,
  groupOrderIndex,
  isMainBoardManager,
  type Overseer,
} from '@/lib/manager_sections'

type Lane = { title: string; meta: string; tone: 'ok' | 'warn' | 'bad'; tag?: string }

type Props = {
  flag: string
  name: string
  regionCode: 'ph' | 'eu' | 'sa' | 'uk'
  subtitle: string
  conversion: { pct: number; color: string }   // hardcoded — needs historical data
  conversionNote?: string
  lanes?: Lane[]
}

export const dynamic = 'force-dynamic'

const SUBSTAGE_DISPLAY_LIMIT = 20
const MANAGER_DISPLAY_LIMIT = 12

export default async function DepartmentPage({ flag, name, regionCode, subtitle, conversion, conversionNote, lanes }: Props) {
  const region = regionCode.toUpperCase() as Region
  const phase = getRegionPhase(region)

  let stats: Awaited<ReturnType<typeof getRegionStats>> | null = null
  let stale: StaleCandidate[] = []
  let dataError: string | null = null
  try {
    ;[stats, stale] = await Promise.all([
      getRegionStats(region),
      getStaleCandidates(region, 5, 15),
    ])
  } catch (err) {
    dataError = err instanceof Error ? err.message : String(err)
  }

  const bucket = (b: keyof NonNullable<typeof stats>['byBucket']) => stats?.byBucket[b] ?? 0
  const fmt = (n: number) => n.toLocaleString()

  // Match Monday's board order — preserves the top-to-bottom flow operators expect
  const inPipelineGroups = (stats?.byGroup ?? [])
    .filter(g => uiBucket(g.stage) !== null)
    .sort((a, b) => groupOrderIndex(region, a.groupTitle) - groupOrderIndex(region, b.groupTitle))
    .slice(0, SUBSTAGE_DISPLAY_LIMIT)
  const tierEntries = Object.entries(stats?.tierDist ?? {}).sort((a, b) => b[1] - a[1])
  const totalTiered = tierEntries.reduce((acc, [, v]) => acc + v, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
              <span style={{ marginRight: 10 }}>{flag}</span>{name}
            </h1>
            {phase && (
              <span style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600,
                padding: '4px 10px', borderRadius: 6,
                background: phaseBg(phase), color: phaseColor(phase),
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}>
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
                </svg>
                {phaseLabel(phase)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: conversion.color, lineHeight: 1 }}>{conversion.pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{conversionNote ?? 'conversion rate'}</div>
        </div>
      </div>

      {dataError && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
          Couldn&apos;t load live data: {dataError}
        </div>
      )}

      {/* KPIs — PH excludes Active + Offboarded because the PH board hosts those for ALL regions
          (cross-region operational hub). Showing them under "Philippines" is misleading. */}
      {region === 'PH' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 10 }}>
            <KpiCard
              label="PH Recruiting"
              value={fmt(bucket('typeform') + bucket('passed') + bucket('pending') + bucket('scheduled'))}
              meta="Typeform → scheduled interview"
              href={`/candidates?region=PH&bucket=typeform,passed,pending,scheduled`}
            />
            <KpiCard
              label="PH Training"
              value={fmt(bucket('training'))}
              meta="Week 1–3 + TB probation"
              segment={`${regionCode}:training`}
            />
            <KpiCard label="Managers in this sector" value={fmt(getConfiguredManagerCount(region))} meta="recruiters + trainers + AEs + Allyson" href="/managers" />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 14, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            Cross-region pool (Active · Standby · PTO · Promoted · Offboarded) lives in its own section in the sidebar — those chatters come from every region, not just PH.
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 14 }}>
          <KpiCard label="In pipeline" value={fmt(stats?.inPipeline ?? 0)} meta={stats ? `${stats.total.toLocaleString()} total · ${(stats.total - stats.inPipeline).toLocaleString()} offboarded` : '—'} segment={`${regionCode}:all`} />
          <KpiCard label="In training" value={fmt(bucket('training'))} meta="all weeks + TB" segment={`${regionCode}:training`} />
          <KpiCard label="Active hires" value={fmt(bucket('active'))} meta="active + promoted + PTO" segment={`${regionCode}:active`} />
          <KpiCard
            label="Offboarded"
            value={fmt(stats ? stats.total - stats.inPipeline : 0)}
            meta="lifetime · click to view"
            color="var(--text-3)"
            href={`/candidates?region=${region}&status=offboarded`}
          />
          <KpiCard label="Managers" value={fmt(getConfiguredManagerCount(region))} meta="configured for this region" href="/managers" />
        </div>
      )}

      {/* High-level pipeline (7 buckets) */}
      <Panel title="Pipeline · 7 stages" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          <PipelineTile num={bucket('typeform')} label="Typeform" segment={`${regionCode}:typeform`} />
          <PipelineTile num={bucket('passed')} label="Passed" segment={`${regionCode}:passed`} />
          <PipelineTile num={bucket('pending')} label="Pending interview" segment={`${regionCode}:pending`} />
          <PipelineTile num={bucket('scheduled')} label="Scheduled interview" segment={`${regionCode}:scheduled`} />
          <PipelineTile num={bucket('training')} label="Training" segment={`${regionCode}:training`} />
          <PipelineTile num={bucket('standby')} label="Standby" segment={`${regionCode}:standby`} />
          <PipelineTile num={bucket('active')} label="Active" segment={`${regionCode}:active`} />
        </div>
      </Panel>

      {/* Stage detail — actual Monday groups with section managers */}
      {inPipelineGroups.length > 0 && (
        <Panel title="Stage detail · live Monday groups + section managers" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {inPipelineGroups.map((g, i) => (
              <StageDetailRow key={g.groupTitle} group={g} region={region} regionCode={regionCode} isLast={i === inPipelineGroups.length - 1} />
            ))}
          </div>
        </Panel>
      )}

      {/* Overseers — PH only */}
      {region === 'PH' && (
        <Panel title="Overseers · cross-section ownership" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {OVERSEERS.map((o, i) => (
              <OverseerRow key={o.name} overseer={o} isLast={i === OVERSEERS.length - 1} />
            ))}
          </div>
        </Panel>
      )}

      {/* Tier distribution */}
      <Panel title="Tier distribution" style={{ marginBottom: 14 }}>
        {totalTiered === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-4)', fontStyle: 'italic', padding: '6px 0' }}>
            No tiers assigned yet — Monday&apos;s Tier column is empty for this region.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tierEntries.length, 5)}, 1fr)`, gap: 10 }}>
            {tierEntries.slice(0, 5).map(([tier, count]) => {
              const display = tierDisplay(tier)
              const pct = totalTiered > 0 ? Math.round((count / totalTiered) * 100) : 0
              return (
                <div key={tier} style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '14px 12px', height: '100%',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    {display && (
                      <span style={{
                        fontSize: 10.5, padding: '3px 8px', borderRadius: 4, fontWeight: 700, fontFamily: 'monospace',
                        background: display.bg, color: display.color,
                      }}>{display.label}</span>
                    )}
                    <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'monospace' }}>{pct}%</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{count.toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tier}</div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {/* Stuck / stale candidates */}
      {stale.length > 0 && (
        <Panel title={`Stuck · ${stale.length} ${stale.length === 1 ? 'candidate' : 'candidates'} idle 5+ days`} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
            Monday item not touched in 5+ days while still in an early stage. Worth a poke.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stale.map((c, i) => (
              <StaleRow key={c.id} candidate={c} isLast={i === stale.length - 1} />
            ))}
          </div>
        </Panel>
      )}

      {/* Per-manager breakdown — only configured section managers (no long-tail Monday assignees) */}
      {stats && stats.byManager.length > 0 && (() => {
        const configured = getAllSectionManagerNames(region)
        const filteredManagers = stats.byManager.filter(m => configured.has(m.name))
        if (filteredManagers.length === 0) return null
        return (
          <Panel title={`By manager · ${filteredManagers.length} ${filteredManagers.length === 1 ? 'person' : 'people'}`} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 0.6fr repeat(5, 0.5fr)', gap: 12, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500, padding: '6px 0 10px', borderBottom: '1px solid var(--border)' }}>
                <span>Manager</span>
                <span style={{ textAlign: 'right' }}>In pipeline</span>
                <span style={{ textAlign: 'right' }}>T1</span>
                <span style={{ textAlign: 'right' }}>T2</span>
                <span style={{ textAlign: 'right' }}>T3</span>
                <span style={{ textAlign: 'right' }}>T4</span>
                <span style={{ textAlign: 'right' }}>—</span>
              </div>
              {filteredManagers.map((m, i) => (
                <ManagerRow key={m.name} manager={m} region={region} isLast={i === filteredManagers.length - 1} />
              ))}
            </div>
          </Panel>
        )
      })()}

      {lanes && (
        <Panel title="Training lanes (manual config)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {lanes.map((l, i) => (
              <div key={l.title} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 4px',
                borderBottom: i < lanes.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{l.meta}</div>
                </div>
                {l.tag && (
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', fontWeight: 500,
                    padding: '3px 8px', borderRadius: 5,
                    background: l.tone === 'warn' ? 'rgba(251,191,36,0.10)' : l.tone === 'bad' ? 'rgba(239,68,68,0.10)' : 'rgba(74,222,128,0.10)',
                    color: l.tone === 'warn' ? 'var(--amber)' : l.tone === 'bad' ? 'var(--red)' : 'var(--green)',
                  }}>{l.tag}</span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function StaleRow({ candidate, isLast }: { candidate: StaleCandidate; isLast: boolean }) {
  const tier = tierDisplay(candidate.tier)
  const stage = candidate.current_group_title ?? candidate.current_stage.replace(/_/g, ' ')
  const daysColor = candidate.daysSinceUpdate >= 14 ? 'var(--red)' : candidate.daysSinceUpdate >= 8 ? 'var(--orange)' : 'var(--amber)'
  return (
    <CandidateLink id={candidate.id} block>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center',
        padding: '11px 4px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }}>
        {tier ? (
          <div style={{
            width: 34, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 10, fontFamily: 'monospace',
            background: tier.bg, color: tier.color,
          }}>{tier.label}</div>
        ) : (
          <div style={{ width: 34, height: 22, borderRadius: 4, background: 'var(--surface-3)' }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stage}{candidate.assigned_manager ? ` · ${candidate.assigned_manager}` : ''}
          </div>
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: daysColor, whiteSpace: 'nowrap' }}>{candidate.daysSinceUpdate}d idle</span>
      </div>
    </CandidateLink>
  )
}

function StageDetailRow({ group, region, regionCode, isLast }: { group: GroupSummary; region: Region; regionCode: string; isLast: boolean }) {
  const bucket = uiBucket(group.stage)
  // Filter by EXACT Monday group title — not by bucket — so clicking "TRAINING BOARD CHATTERS"
  // shows only those 42, not all 272 in the wider training bucket.
  const segment = `${regionCode}:group:${group.groupTitle}`
  const accentByBucket: Record<string, string> = {
    typeform: 'var(--text-4)', passed: 'var(--blue)',
    pending: 'var(--amber)', scheduled: 'var(--blue)',
    training: 'var(--violet)', standby: 'var(--text-3)', active: 'var(--green)',
  }
  const accent = bucket ? accentByBucket[bucket] : 'var(--text-4)'
  const { managers, shift } = getSectionManagers(region, group.groupTitle)
  const inner = (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.4fr) auto auto',
      alignItems: 'center', gap: 14,
      padding: '12px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      cursor: segment ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.groupTitle}</span>
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {managers.length > 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {managers.map(displayName).join(' · ')}
          </div>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontStyle: 'italic' }}>main board</span>
        )}
        {shift && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{shift}</span>}
      </div>
      {bucket && (
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)', fontWeight: 500 }}>{bucket}</span>
      )}
      <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 48, textAlign: 'right' }}>{group.count.toLocaleString()}</span>
    </div>
  )
  return segment ? <SegmentLink segment={segment} block>{inner}</SegmentLink> : <div>{inner}</div>
}

function OverseerRow({ overseer, isLast }: { overseer: Overseer; isLast: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 2fr)',
      alignItems: 'center', gap: 14,
      padding: '12px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{overseer.display}</span>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{overseer.role}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {overseer.scope.map(s => (
          <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-3)', color: 'var(--text-2)' }}>{s}</span>
        ))}
      </div>
    </div>
  )
}

function ManagerRow({ manager, region, isLast }: { manager: ManagerSummary; region: Region; isLast: boolean }) {
  const cellNum = (n: number, color?: string) => (
    <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: n > 0 ? (color || 'var(--text)') : 'var(--text-4)' }}>
      {n}
    </span>
  )
  const isUnassigned = manager.name === 'Unassigned'
  const isClickable = !isUnassigned
  const mainBoard = !isUnassigned && isMainBoardManager(region, manager.name)
  const tag = isUnassigned ? null : mainBoard
    ? <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(96,165,250,0.10)', color: 'var(--blue)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Main board</span>
    : <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(167,139,250,0.12)', color: 'var(--violet)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Section</span>
  const content = (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 0.6fr repeat(5, 0.5fr)',
      alignItems: 'center', gap: 12, padding: '11px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      cursor: isClickable ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isUnassigned ? manager.name : displayName(manager.name)}</span>
        {tag}
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{manager.inPipeline.toLocaleString()}</span>
      {cellNum(manager.t1, 'var(--red)')}
      {cellNum(manager.t2, 'var(--orange)')}
      {cellNum(manager.t3, 'var(--blue)')}
      {cellNum(manager.t4, 'var(--green)')}
      {cellNum(manager.ungraded)}
    </div>
  )
  return isClickable
    ? <Link href={`/candidates?manager=${encodeURIComponent(manager.name)}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{content}</Link>
    : content
}

function KpiCard({ label, value, meta, color, segment, href }: { label: string; value: string; meta: string; color?: string; segment?: string; href?: string }) {
  const clickable = !!(segment || href)
  const card = (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '22px 24px',
      cursor: clickable ? 'pointer' : 'default', height: '100%',
    }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{meta}</div>
    </div>
  )
  if (segment) return <SegmentLink segment={segment} block>{card}</SegmentLink>
  if (href) return <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{card}</Link>
  return card
}

function PipelineTile({ num, label, segment }: { num: number; label: string; segment: string }) {
  return (
    <SegmentLink segment={segment} block>
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '14px 12px', textAlign: 'center',
        cursor: 'pointer', height: '100%',
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 6 }}>{num.toLocaleString()}</div>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
      </div>
    </SegmentLink>
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
