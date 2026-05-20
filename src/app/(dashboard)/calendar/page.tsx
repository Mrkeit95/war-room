export default function CalendarPage() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7
  const prevMonthLast = new Date(year, month, 0).getDate()
  const todayNum = today.getDate()

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateKey = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`

  const events: Record<string, { title: string; color: string }[]> = {
    [dateKey(todayNum)]: [
      { title: 'Apple interview · Maria S.', color: 'var(--blue)' },
      { title: 'Apple interview · Jenna K.', color: 'var(--blue)' },
      { title: 'Weekly call · Aleksandar', color: 'var(--green)' },
    ],
    [dateKey(todayNum + 2)]: [{ title: 'Weekly call · Sebastien', color: 'var(--green)' }],
    [dateKey(todayNum + 3)]: [{ title: 'PH Lane B Week 1 ends', color: 'var(--red)' }, { title: 'PH recruiters review', color: 'var(--amber)' }],
    [dateKey(todayNum + 5)]: [{ title: 'EU Week 1 ends', color: 'var(--green)' }],
    [dateKey(todayNum + 6)]: [{ title: 'PH Lane A starts', color: 'var(--green)' }, { title: 'Maja P. offboard decision', color: 'var(--red)' }],
  }

  const days = []
  for (let i = startOffset - 1; i >= 0; i--) days.push({ day: prevMonthLast - i, current: false })
  for (let d = 1; d <= lastDay.getDate(); d++) days.push({ day: d, current: true })
  const remaining = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7 - days.length
  for (let d = 1; d <= remaining; d++) days.push({ day: d, current: false })

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Calendar</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Interviews, cohort milestones, and manager check-ins.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>{monthName}</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} style={{ padding: '10px 12px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(110px, 1fr)' }}>
          {days.map((d, i) => {
            const key = d.current ? dateKey(d.day) : ''
            const dayEvents = events[key] || []
            const isToday = d.current && d.day === todayNum
            return (
              <div key={i} style={{
                borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                borderBottom: '1px solid var(--border)',
                padding: '8px 10px',
                background: !d.current ? 'rgba(0,0,0,0.2)' : 'transparent',
              }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 500, marginBottom: 6,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%',
                  background: isToday ? 'var(--text)' : 'transparent',
                  color: isToday ? 'var(--bg)' : d.current ? 'var(--text)' : 'var(--text-4)',
                }}>{d.day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {dayEvents.slice(0, 3).map((e, ei) => (
                    <div key={ei} style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 3, background: 'var(--surface-3)', borderLeft: `2px solid ${e.color}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-2)' }}>{e.title}</div>
                  ))}
                  {dayEvents.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '1px 6px' }}>+{dayEvents.length - 3} more</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
