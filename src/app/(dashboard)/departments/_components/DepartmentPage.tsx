const gradeColors: Record<string, string> = { A: '#4ade80', B: '#60a5fa', C: '#fde047', D: '#fb923c', F: '#ef4444' }
const gradeBg: Record<string, string> = { A: 'rgba(74,222,128,0.15)', B: 'rgba(96,165,250,0.15)', C: 'rgba(253,224,71,0.15)', D: 'rgba(251,146,60,0.15)', F: 'rgba(239,68,68,0.18)' }

type Kpi = { label: string; value: string; meta: string; color?: string }
type PipelineStage = { num: number; label: string }
type GradeBucket = { grade: 'A' | 'B' | 'C' | 'D' | 'F'; count: number }
type Lane = { title: string; meta: string; tone: 'ok' | 'warn' | 'bad'; tag?: string }

type Props = {
  flag: string
  name: string
  subtitle: string
  conversion: { pct: number; color: string }
  kpis: Kpi[]
  pipeline: PipelineStage[]
  gradeDistribution?: GradeBucket[]
  lanes?: Lane[]
}

export default function DepartmentPage({ flag, name, subtitle, conversion, kpis, pipeline, gradeDistribution, lanes }: Props) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
            <span style={{ marginRight: 10 }}>{flag}</span>{name}
          </h1>
          <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: conversion.color, lineHeight: 1 }}>{conversion.pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>conversion rate</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{k.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: k.color || 'var(--text)' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{k.meta}</div>
          </div>
        ))}
      </div>

      <Panel title="Pipeline" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${pipeline.length}, 1fr)`, gap: 10 }}>
          {pipeline.map(s => (
            <div key={s.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 6 }}>{s.num}</div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Panel>

      {gradeDistribution && (
        <Panel title="Grade distribution" style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {gradeDistribution.map(g => (
              <div key={g.grade} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, fontFamily: 'monospace',
                  background: gradeBg[g.grade], color: gradeColors[g.grade],
                }}>{g.grade}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 600 }}>{g.count}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

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

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', ...style }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}
