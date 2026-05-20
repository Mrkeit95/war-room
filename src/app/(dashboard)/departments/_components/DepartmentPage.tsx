import SegmentLink from '@/components/SegmentLink'
import { getRegionPhase, phaseBg, phaseColor, phaseLabel } from '@/lib/rotation'
import type { Region } from '@/lib/candidates'
import { getRegionStats } from '@/lib/db'

const gradeColors: Record<string, string> = { A: '#4ade80', B: '#60a5fa', C: '#fde047', D: '#fb923c', F: '#ef4444' }
const gradeBg: Record<string, string> = { A: 'rgba(74,222,128,0.15)', B: 'rgba(96,165,250,0.15)', C: 'rgba(253,224,71,0.15)', D: 'rgba(251,146,60,0.15)', F: 'rgba(239,68,68,0.18)' }

type Lane = { title: string; meta: string; tone: 'ok' | 'warn' | 'bad'; tag?: string }

type Props = {
  flag: string
  name: string
  regionCode: 'ph' | 'eu' | 'sa' | 'uk'
  subtitle: string
  conversion: { pct: number; color: string }   // currently hardcoded — needs historical data
  conversionNote?: string                       // optional small note next to %
  avgGrade?: { value: string; color: string; meta: string }
  lanes?: Lane[]
}

export const dynamic = 'force-dynamic'

export default async function DepartmentPage({ flag, name, regionCode, subtitle, conversion, conversionNote, avgGrade, lanes }: Props) {
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="In pipeline" value={fmt(stats?.inPipeline ?? 0)} meta={stats ? `${stats.total.toLocaleString()} total on board` : '—'} segment={`${regionCode}:all`} />
        <KpiCard label="In training" value={fmt(bucket('training'))} meta="all weeks + TB" segment={`${regionCode}:training`} />
        <KpiCard label="Active hires" value={fmt(bucket('active'))} meta="active + promoted + PTO" segment={`${regionCode}:active`} />
        {avgGrade ? (
          <KpiCard label="Avg grade" value={avgGrade.value} meta={avgGrade.meta} color={avgGrade.color} />
        ) : (
          <KpiCard label="Avg grade" value="—" meta="Grading not yet enabled" />
        )}
      </div>

      <Panel title="Pipeline" style={{ marginBottom: 14 }}>
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

      <Panel title="Grade distribution" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {(['A', 'B', 'C', 'D', 'F'] as const).map(g => (
            <SegmentLink key={g} segment={`${regionCode}:grade-${g}`} block>
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '14px 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                cursor: 'pointer', height: '100%',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, fontFamily: 'monospace',
                  background: gradeBg[g], color: gradeColors[g],
                }}>{g}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 600 }}>{fmt(stats?.gradeDist[g] ?? 0)}</div>
              </div>
            </SegmentLink>
          ))}
        </div>
        {stats && Object.values(stats.gradeDist).every(n => n === 0) && (
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 12, textAlign: 'center', fontStyle: 'italic' }}>
            No grades synced yet — the Tier column in Monday will be used once your grading process is in place.
          </div>
        )}
      </Panel>

      {lanes && (
        <Panel title="Training lanes">
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
