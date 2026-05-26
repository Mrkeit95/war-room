import Link from 'next/link'
import BriefingReminders from '@/components/BriefingReminders'
import CandidateLink from '@/components/CandidateLink'
import { getBriefingData, getCurrentAlerts, getLastSyncedAt, type Alert, type BriefingCandidate } from '@/lib/db'
import { tierDisplay } from '@/lib/candidates'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  let data: Awaited<ReturnType<typeof getBriefingData>> | null = null
  let lastSyncedAt: string | null = null
  let alerts: Alert[] = []
  let error: string | null = null
  try {
    ;[data, lastSyncedAt, alerts] = await Promise.all([getBriefingData(), getLastSyncedAt(), getCurrentAlerts()])
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const standbyAlerts = alerts.filter(a => a.type === 'standby_unassigned')
  const ptoAlerts = alerts.filter(a => a.type === 'pto_overdue')

  const narrative = data
    ? buildNarrative(data)
    : 'Live data is temporarily unavailable.'

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '24px 0 36px', borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.32em', color: 'var(--text-4)', marginBottom: 10, fontWeight: 500, fontFamily: 'monospace' }}>YOUR MORNING BRIEFING</div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 8 }}>{dateStr}</div>
        <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
          {narrative}
        </div>
        {lastSyncedAt && (
          <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 12 }}>
            Data synced {new Date(lastSyncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>

      <BriefingReminders />

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 36, fontSize: 12.5, color: 'var(--red)' }}>
          Couldn&apos;t load briefing data: {error}
        </div>
      )}

      {data && (
        <>
          {/* Standby SLA — most operationally urgent, surfaces first */}
          {standbyAlerts.length > 0 && (
            <Section title="Standby — needs page assignment today">
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
                {standbyAlerts.length} {standbyAlerts.length === 1 ? 'chatter is' : 'chatters are'} on standby with no BOARD assigned. They&apos;ll quit if they sit too long.
                {' '}<Link href="/standby" style={{ color: 'var(--text-3)' }}>See all →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {standbyAlerts.slice(0, 10).map((a, i) => (
                  <AlertRow key={a.id} alert={a} num={String(i + 1).padStart(2, '0')} />
                ))}
                {standbyAlerts.length > 10 && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)', textAlign: 'center', padding: '6px 0', fontStyle: 'italic' }}>
                    +{standbyAlerts.length - 10} more on /standby
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* PTO 2-week rule */}
          {ptoAlerts.length > 0 && (
            <Section title="Personal Time Off — decision time">
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
                {ptoAlerts.length} {ptoAlerts.length === 1 ? 'person has' : 'people have'} been in PTO for 2+ weeks. Time to let go.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ptoAlerts.map((a, i) => (
                  <AlertRow key={a.id} alert={a} num={String(i + 1).padStart(2, '0')} />
                ))}
              </div>
            </Section>
          )}

          {/* The numbers */}
          <Section title="The numbers">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <NumberCard value={data.newLast24h} label="New (24h)" />
              <NumberCard value={data.interviews} label="In interviews" />
              <NumberCard value={data.atRiskTotal} label="At risk" color="var(--red)" />
              <NumberCard value={data.topTierTotal} label="Top tier" color="var(--green)" />
            </div>
          </Section>

          {/* Worth your attention */}
          <Section title="Worth your attention today">
            {data.atRiskInTraining.length === 0 ? (
              <Empty>No at-risk candidates currently in training. Nothing flagged.</Empty>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
                  {data.atRiskInTraining.length} Tier 1–2 {data.atRiskInTraining.length === 1 ? 'candidate is' : 'candidates are'} in training right now — they need a closer look before they slip.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.atRiskInTraining.map((c, i) => (
                    <CandidateRow key={c.id} candidate={c} num={String(i + 1).padStart(2, '0')} accent="var(--amber)" />
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Top tier */}
          <Section title="Top tier — recognize them">
            {data.topTier.length === 0 ? (
              <Empty>
                No Tier 4 candidates in the pipeline right now.
                {data.topTierTotal > 0 && ` ${data.topTierTotal} candidates are Tier 3 — see Top performers.`}
              </Empty>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
                  {data.topTier.length} {data.topTier.length === 1 ? 'candidate is' : 'candidates are'} at the top tier — worth a word of recognition.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.topTier.map((c, i) => (
                    <CandidateRow key={c.id} candidate={c} num={String(i + 1).padStart(2, '0')} accent="var(--green)" />
                  ))}
                </div>
              </>
            )}
          </Section>
        </>
      )}

      <div style={{ textAlign: 'center', padding: '32px 24px', borderTop: '1px solid var(--border)', marginTop: 36, color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', lineHeight: 1.6 }}>
        Read this once. Then go open the dashboard.
      </div>
    </div>
  )
}

function buildNarrative(d: Awaited<ReturnType<typeof getBriefingData>>): string {
  const parts: string[] = []
  if (d.newLast24h > 0) parts.push(`${d.newLast24h} new candidate${d.newLast24h === 1 ? '' : 's'} entered the pipeline`)
  if (d.transitions24h > 0) parts.push(`${d.transitions24h} stage change${d.transitions24h === 1 ? '' : 's'} recorded`)
  const lead = parts.length > 0
    ? `In the last 24 hours: ${parts.join(' and ')}.`
    : 'No new candidates or stage changes in the last 24 hours.'
  const tail = d.atRiskInTraining.length > 0
    ? ` ${d.atRiskInTraining.length} at-risk candidate${d.atRiskInTraining.length === 1 ? '' : 's'} in training need${d.atRiskInTraining.length === 1 ? 's' : ''} attention.`
    : ''
  return lead + tail
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 24, height: 1, background: 'var(--text-3)', display: 'inline-block' }} />
        {title}
      </div>
      {children}
    </div>
  )
}

function NumberCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4, color: color || 'var(--text)' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function CandidateRow({ candidate, num, accent }: { candidate: BriefingCandidate; num: string; accent: string }) {
  const tier = tierDisplay(candidate.tier)
  const stage = candidate.current_group_title ?? candidate.current_stage.replace(/_/g, ' ')
  return (
    <CandidateLink id={candidate.id} block>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center',
        borderLeft: `2px solid ${accent}`, cursor: 'pointer',
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)', width: 18, flexShrink: 0 }}>{num}</div>
        {tier && (
          <div style={{
            width: 34, height: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 10, fontFamily: 'monospace', flexShrink: 0,
            background: tier.bg, color: tier.color,
          }}>{tier.label}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{candidate.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 10.5, marginRight: 6 }}>{candidate.region}</span>
            {stage}{candidate.assigned_manager ? ` · ${candidate.assigned_manager}` : ''}
          </div>
        </div>
      </div>
    </CandidateLink>
  )
}

function AlertRow({ alert, num }: { alert: Alert; num: string }) {
  const accent = alert.severity === 'critical' ? 'var(--red)' : alert.severity === 'warning' ? 'var(--amber)' : 'var(--yellow)'
  const content = (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center',
      borderLeft: `2px solid ${accent}`, cursor: alert.candidateId ? 'pointer' : 'default',
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)', width: 18, flexShrink: 0 }}>{num}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{alert.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{alert.meta}</div>
      </div>
      <span style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
        padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
        background: alert.severity === 'critical' ? 'rgba(239,68,68,0.10)' : 'rgba(251,191,36,0.10)',
        color: accent,
      }}>{alert.severity}</span>
    </div>
  )
  return alert.candidateId ? <CandidateLink id={alert.candidateId} block>{content}</CandidateLink> : content
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
      {children}
    </div>
  )
}
