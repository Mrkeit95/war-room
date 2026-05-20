import CandidateLink from '@/components/CandidateLink'
import { gradeBg, gradeColors } from '@/lib/candidates'

const PERFORMERS = [
  { id: 'maria-l', name: 'Maria L.', grade: 'A', trend: '↑', info: 'EU · Week 1 · Day 3', tag: 'Fast learner' },
  { id: 'anna-g', name: 'Anna G.', grade: 'A', trend: '↑', info: 'PH · Lane A · Week 1', tag: 'Grammar' },
  { id: 'sofia-m', name: 'Sofia M.', grade: 'A', trend: '↑', info: 'EU · Week 1 · exp', tag: 'Experienced' },
  { id: 'bea-m', name: 'Bea M.', grade: 'A', trend: '↑', info: 'PH · Lane A · Week 1', tag: 'Personality' },
  { id: 'jenna-k', name: 'Jenna K.', grade: 'A', trend: '→', info: 'PH · Interview today', tag: 'Exp 2yr' },
]

export default function TopPerformersPage() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Top performers</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>A-graded candidates trending up over the last 3+ days</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {PERFORMERS.map((p, i) => (
          <CandidateLink key={p.id} id={p.id} block>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px',
              borderBottom: i < PERFORMERS.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12, fontFamily: 'monospace',
                background: gradeBg[p.grade], color: gradeColors[p.grade], flexShrink: 0,
              }}>{p.grade}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.name}
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: p.trend === '↑' ? 'var(--green)' : p.trend === '↓' ? 'var(--red)' : 'var(--text-3)' }}>{p.trend}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.info}
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(74,222,128,0.10)', color: 'var(--green)', fontWeight: 500 }}>{p.tag}</span>
                </div>
              </div>
            </div>
          </CandidateLink>
        ))}
      </div>
    </div>
  )
}
