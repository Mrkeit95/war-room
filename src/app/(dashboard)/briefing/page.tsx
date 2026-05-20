import BriefingReminders from '@/components/BriefingReminders'

export default function BriefingPage() {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '24px 0 36px', borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.32em', color: 'var(--text-4)', marginBottom: 10, fontWeight: 500, fontFamily: 'monospace' }}>YOUR MORNING BRIEFING</div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 8 }}>{dateStr}</div>
        <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          Overnight: 3 new typeforms arrived, 2 candidates moved to active, 1 cohort approaches graduation. UK needs your attention today — Noah has been quiet.
        </div>
      </div>

      <BriefingReminders />

      {[
        {
          title: 'The numbers',
          items: null,
          numbers: [
            { value: '+3', label: 'New overnight' },
            { value: '8', label: 'Interviews today' },
            { value: '9', label: 'At risk', color: 'var(--red)' },
            { value: '14', label: 'Top performers', color: 'var(--green)' },
          ]
        }
      ].map(section => (
        <div key={section.title} style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 1, background: 'var(--text-3)', display: 'inline-block' }} />
            {section.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {section.numbers?.map(n => (
              <div key={n.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4, color: n.color || 'var(--text)' }}>{n.value}</div>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500 }}>{n.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {[
        {
          title: "Worth your attention today",
          items: [
            { type: 'critical', num: '01', title: "Noah's UK board is silent — 4 candidates stuck for 5+ days", meta: "Threshold is 48hr · longest stuck is 6d · message him directly today" },
            { type: 'critical', num: '02', title: "Sebastien has 3 candidates rotting in Pending Interview", meta: "Carlos M. (6d), Lucia R. (5d), Diego F. (4d) — Sebastien needs to schedule" },
            { type: 'warning', num: '03', title: "Three trainees graded D or F are trending down toward failing", meta: "Maja P. (PH Lane B), Ivan P. (EU), James T. (UK) — decide who to invest in vs offboard" },
          ]
        },
        {
          title: "Wins to recognize",
          items: [
            { type: 'spotlight', num: '01', title: "Aleksandar's cohort is averaging 7.4 — strongest in 2 months", meta: "5 trainees, 4 expected to pass · tell him on today's 3pm call" },
            { type: 'good', num: '02', title: "5 candidates trending toward fast-track status", meta: "Maria L., Anna G., Sofia M., Bea M., Jenna K. — all A-graded, trending up" },
          ]
        },
        {
          title: "This week ahead",
          items: [
            { type: 'default', num: '→', title: "Friday: PH Lane B Week 1 graduation", meta: "6 trainees · 3 expected to pass based on current grades" },
            { type: 'default', num: '→', title: "Sunday: EU Week 1 cohort completes", meta: "5 trainees · 4 expected to pass · Aleksandar's strongest cohort yet" },
            { type: 'warning', num: '→', title: "PH share is still at 82% — drifting from 25% target", meta: "EU needs ~4× current intake to shift the mix · push sourcing" },
          ]
        }
      ].map(section => (
        <div key={section.title} style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 1, background: 'var(--text-3)', display: 'inline-block' }} />
            {section.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {section.items.map(item => {
              const borderColor = item.type === 'critical' ? 'var(--red)' : item.type === 'warning' ? 'var(--amber)' : item.type === 'good' ? 'var(--green)' : item.type === 'spotlight' ? 'var(--yellow)' : 'var(--text-4)'
              return (
                <div key={item.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 14, borderLeft: `2px solid ${borderColor}` }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)', width: 18, flexShrink: 0, paddingTop: 1 }}>{item.num}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, lineHeight: 1.4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.meta}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ textAlign: 'center', padding: '32px 24px', borderTop: '1px solid var(--border)', marginTop: 36, color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', lineHeight: 1.6 }}>
        Read this once. Then go open the dashboard.
      </div>
    </div>
  )
}
