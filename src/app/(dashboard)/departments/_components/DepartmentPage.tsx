import SegmentLink from '@/components/SegmentLink'
import { getRegionPhase, phaseBg, phaseColor, phaseLabel } from '@/lib/rotation'
import { tierDisplay, type Region } from '@/lib/candidates'
import { getRegionStats, type GroupSummary, type ManagerSummary } from '@/lib/db'
import { uiBucket } from '@/lib/stages'

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
  let dataError: string | null = null
  try {
    stats = await getRegionStats(region)
  } catch (err) {
    dataError = err instanceof Error ? err.message : String(err)
  }

  const bucket = (b: keyof NonNullable<typeof stats>['byBucket']) => stats?.byBucket[b] ?? 0
  const fmt = (n: number) => n.toLocaleString()

  const inPipelineGroups = (stats?.byGroup ?? []).filter(g => uiBucket(g.stage) !== null).slice(0, SUBSTAGE_DISPLAY_LIMIT)
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

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="In pipeline" value={fmt(stats?.inPipeline ?? 0)} meta={stats ? `${stats.total.toLocaleString()} total on board` : '—'} segment={`${regionCode}:all`} />
        <KpiCard label="In training" value={fmt(bucket('training'))} meta="all weeks + TB" segment={`${regionCode}:training`} />
        <KpiCard label="Active hires" value={fmt(bucket('active'))} meta="active + promoted + PTO" segment={`${regionCode}:active`} />
        <KpiCard label="Managers" value={fmt(stats?.byManager.length ?? 0)} meta="people in this sector" />
      </div>

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

      {/* Stage detail — actual Monday groups */}
      {inPipelineGroups.length > 0 && (
        <Panel title="Stage detail · live Monday groups" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {inPipelineGroups.map((g, i) => (
              <StageDetailRow key={g.groupTitle} group={g} regionCode={regionCode} isLast={i === inPipelineGroups.length - 1} />
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

      {/* Per-manager breakdown */}
      {stats && stats.byManager.length > 0 && (
        <Panel title={`By manager · ${stats.byManager.length} ${stats.byManager.length === 1 ? 'person' : 'people'}`} style={{ marginBottom: 14 }}>
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
            {stats.byManager.slice(0, MANAGER_DISPLAY_LIMIT).map((m, i) => (
              <ManagerRow key={m.name} manager={m} isLast={i === Math.min(stats!.byManager.length, MANAGER_DISPLAY_LIMIT) - 1} />
            ))}
            {stats.byManager.length > MANAGER_DISPLAY_LIMIT && (
              <div style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'center', padding: '10px 0 0', fontStyle: 'italic' }}>
                +{stats.byManager.length - MANAGER_DISPLAY_LIMIT} more managers
              </div>
            )}
          </div>
        </Panel>
      )}

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

function StageDetailRow({ group, regionCode, isLast }: { group: GroupSummary; regionCode: string; isLast: boolean }) {
  const bucket = uiBucket(group.stage)
  const segment = bucket ? `${regionCode}:${bucket}` : null
  const accentByBucket: Record<string, string> = {
    typeform: 'var(--text-4)', passed: 'var(--blue)',
    pending: 'var(--amber)', scheduled: 'var(--blue)',
    training: 'var(--violet)', standby: 'var(--text-3)', active: 'var(--green)',
  }
  const accent = bucket ? accentByBucket[bucket] : 'var(--text-4)'
  const inner = (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto',
      alignItems: 'center', gap: 14,
      padding: '12px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      cursor: segment ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.groupTitle}</span>
      </div>
      {bucket && (
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)', fontWeight: 500 }}>{bucket}</span>
      )}
      <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 48, textAlign: 'right' }}>{group.count.toLocaleString()}</span>
    </div>
  )
  return segment ? <SegmentLink segment={segment} block>{inner}</SegmentLink> : <div>{inner}</div>
}

function ManagerRow({ manager, isLast }: { manager: ManagerSummary; isLast: boolean }) {
  const cellNum = (n: number, color?: string) => (
    <span style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right', color: n > 0 ? (color || 'var(--text)') : 'var(--text-4)' }}>
      {n}
    </span>
  )
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 0.6fr repeat(5, 0.5fr)',
      alignItems: 'center', gap: 12, padding: '11px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manager.name}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{manager.inPipeline.toLocaleString()}</span>
      {cellNum(manager.t1, 'var(--red)')}
      {cellNum(manager.t2, 'var(--orange)')}
      {cellNum(manager.t3, 'var(--blue)')}
      {cellNum(manager.t4, 'var(--green)')}
      {cellNum(manager.ungraded)}
    </div>
  )
}

function KpiCard({ label, value, meta, color, segment }: { label: string; value: string; meta: string; color?: string; segment?: string }) {
  const card = (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '22px 24px',
      cursor: segment ? 'pointer' : 'default', height: '100%',
    }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{meta}</div>
    </div>
  )
  return segment ? <SegmentLink segment={segment} block>{card}</SegmentLink> : card
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
