import Link from 'next/link'
import CandidateLink from '@/components/CandidateLink'
import Reminders from '@/components/Reminders'

export default function DashboardPage() {
  return (
    <div>
      {/* Hero metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        {[
          { label: 'In pipeline', value: '487', meta: 'across 4 regions', delta: '↑ 12', pct: 78, color: 'var(--green)', href: '/pipeline' },
          { label: 'Interviews', value: '34', meta: '8 today', delta: '+3 stuck', pct: 64, color: 'var(--yellow)', deltaColor: 'var(--text-3)', href: '/calendar' },
          { label: 'In training', value: '68', meta: '6 lanes', delta: '2 ending Fri', pct: 85, color: 'var(--green)', deltaColor: 'var(--text-3)', href: '/pipeline' },
          { label: 'Active hires', value: '437', meta: '+3 this week', delta: '↑ 0.7%', pct: 92, color: 'var(--green)', href: '/pipeline' },
        ].map((card) => (
          <Link key={card.label} href={card.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
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
          { flag: '🇵🇭', name: 'Philippines', manager: 'Apple · Darla · Pauline', pct: 38, color: 'var(--amber)', grade: 'B-', stars: 6, risk: 4, alerts: 2, slug: 'ph' },
          { flag: '🇪🇺', name: 'Europe', manager: 'Aleksandar', pct: 41, color: 'var(--green)', grade: 'B+', stars: 5, risk: 1, alerts: 1, slug: 'eu' },
          { flag: '🇧🇷', name: 'South America', manager: 'Sebastien', pct: 35, color: 'var(--amber)', grade: 'C+', stars: 2, risk: 2, alerts: 1, slug: 'sa' },
          { flag: '🇬🇧', name: 'United Kingdom', manager: 'Noah', pct: 22, color: 'var(--red)', grade: 'C', stars: 1, risk: 2, alerts: 2, slug: 'uk' },
        ].map((dept) => (
          <Link key={dept.name} href={`/departments/${dept.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '20px 22px', cursor: 'pointer',
            }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 6 }}>
              {dept.flag} {dept.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{dept.manager}</div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: dept.color, marginBottom: 4 }}>{dept.pct}%</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>conversion rate</div>
            <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ height: '100%', borderRadius: 2, background: dept.color, width: `${dept.pct}%` }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 12 }}>
              {[
                { label: 'Avg grade', value: dept.grade },
                { label: 'Stars', value: dept.stars, up: true },
                { label: 'At risk', value: dept.risk, down: true },
                { label: 'Alerts', value: dept.alerts },
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
        ))}
      </div>

      {/* Two column: action feed + side panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        {/* Action feed */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Today · What needs you</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>13 items</div>
          </div>

          {/* Critical items */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', margin: '0 0 10px', fontWeight: 500 }}>Critical</div>
          {[
            { title: 'Follow up with Noah — 4 typeforms untouched for 5+ days', meta: 'UK · Threshold is 48hr' },
            { title: 'Sebastien — 3 candidates in Pending Interview > 4 days', meta: 'SA · Stage expected 2 days' },
            { title: '3 trainees graded D or below trending down — likely fails', meta: 'PH Lane B · EU W1 · UK W1' },
          ].map((item) => (
            <div key={item.title} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 8,
              display: 'flex', gap: 14, position: 'relative',
              borderLeft: '2px solid var(--red)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.meta}</div>
              </div>
              <span style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '3px 8px', borderRadius: 5, fontWeight: 500,
                background: 'rgba(239,68,68,0.10)', color: 'var(--red)',
                whiteSpace: 'nowrap', alignSelf: 'flex-start',
              }}>Critical</span>
            </div>
          ))}

          {/* Spotlight */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', margin: '20px 0 10px', fontWeight: 500 }}>Spotlight</div>
          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 8,
            display: 'flex', gap: 14, borderLeft: '2px solid var(--yellow)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>5 standout candidates this week — consider fast-track</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>A-graded · trending up</div>
            </div>
            <span style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
              padding: '3px 8px', borderRadius: 5, fontWeight: 500,
              background: 'rgba(253,224,71,0.10)', color: 'var(--yellow)',
              whiteSpace: 'nowrap', alignSelf: 'flex-start',
            }}>Spotlight</span>
          </div>

          {/* Check-ins */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-4)', margin: '20px 0 10px', fontWeight: 500 }}>Today&apos;s check-ins</div>
          {[
            { title: "Apple has 3 interviews today — follow up tonight", meta: 'PH Recruiting · 10am, 1pm, 4pm Manila' },
            { title: "Aleksandar — Day 3 of training, Ivan slipping", meta: 'EU · Week 1' },
          ].map((item) => (
            <div key={item.title} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 8,
              display: 'flex', gap: 14, borderLeft: '2px solid var(--green)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.meta}</div>
              </div>
              <span style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '3px 8px', borderRadius: 5, fontWeight: 500,
                background: 'rgba(74,222,128,0.10)', color: 'var(--green)',
                whiteSpace: 'nowrap', alignSelf: 'flex-start',
              }}>Check in</span>
            </div>
          ))}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { num: 1, id: 'maria-l', name: 'Maria L.', pct: 92 },
                { num: 2, id: 'anna-g', name: 'Anna G.', pct: 90 },
                { num: 3, id: 'sofia-m', name: 'Sofia M.', pct: 88 },
                { num: 4, id: 'bea-m', name: 'Bea M.', pct: 84 },
                { num: 5, id: 'jenna-k', name: 'Jenna K.', pct: 80 },
              ].map((p) => (
                <CandidateLink key={p.id} id={p.id} block>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-3)', width: 16, flexShrink: 0 }}>{p.num}</div>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{p.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{p.name}</div>
                      <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'var(--green)', width: `${p.pct}%` }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--green)', width: 56, textAlign: 'right', flexShrink: 0 }}>A · ↑</div>
                  </div>
                </CandidateLink>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Upcoming</div>
            </div>
            {[
              { title: 'Apple interviews · PH', meta: 'Today · 10am, 1pm, 4pm', color: 'var(--yellow)' },
              { title: 'Weekly call · Aleksandar', meta: 'Today · 3pm', color: 'var(--green)' },
              { title: 'PH Lane B Week 1 ends', meta: 'Fri May 22', color: 'var(--red)' },
              { title: 'EU Week 1 ends', meta: 'Sun May 24', color: 'var(--green)' },
            ].map((item) => (
              <div key={item.title} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 3, borderRadius: 1.5, flexShrink: 0, background: item.color }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.meta}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Source mix */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500 }}>Source mix · PH share</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Target 25%</div>
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--red)', lineHeight: 1, marginBottom: 6 }}>82%</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>57 points above target</div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'var(--red)', width: '82%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
