const ENTRIES = [
  { date: 'May 18 · 14:23', title: 'Maria L. moved to Day 3 of EU Week 1 · graded A ↑', meta: 'Aleksandar', tone: 'up' as const },
  { date: 'May 18 · 11:47', title: 'Maja P. graded F · Mark recommends offboard', meta: 'PH Lane B', tone: 'down' as const },
  { date: 'May 18 · 09:15', title: '3 new typeforms came in overnight', meta: '2 PH · 1 EU', tone: 'neutral' as const },
  { date: 'May 17 · 18:30', title: 'Bea M. graded A · second day in a row', meta: 'PH Lane A', tone: 'up' as const },
  { date: 'May 17 · 16:02', title: 'Carlos M. still pending interview · 5 days', meta: 'SA', tone: 'down' as const },
  { date: 'May 17 · 10:00', title: 'EU Week 1 cohort started · 5 trainees', meta: 'Aleksandar', tone: 'neutral' as const },
]

const toneColor = { up: 'var(--green)', down: 'var(--red)', neutral: 'var(--text-4)' }

export default function ActivityPage() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Activity log</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Recent stage transitions, grade changes, and operational events</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 1, background: 'var(--border)' }} />
          {ENTRIES.map((e, i) => (
            <div key={i} style={{ position: 'relative', paddingBottom: i < ENTRIES.length - 1 ? 22 : 0 }}>
              <div style={{
                position: 'absolute', left: -22, top: 5, width: 9, height: 9, borderRadius: '50%',
                background: toneColor[e.tone],
                boxShadow: '0 0 0 3px var(--surface)',
              }} />
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginBottom: 3 }}>{e.date}</div>
              <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3, lineHeight: 1.4 }}>{e.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{e.meta}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
