import Link from 'next/link'
import BriefingReminders from '@/components/BriefingReminders'
import CandidateLink from '@/components/CandidateLink'
import {
  getBriefingData, getCurrentAlerts, getLastSyncedAt,
  getDepartmentMovements, getRecentMovements, getManagerActivity, getStageDeltas,
  type Alert, type BriefingCandidate, type DepartmentMovement, type RecentMovement, type ManagerActivity, type StageDelta,
} from '@/lib/db'
import { tierDisplay, type Region } from '@/lib/candidates'
import { getOnboardingSnapshot, type OnboardingSnapshot, type ModelWithCapacity } from '@/lib/models'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  let data: Awaited<ReturnType<typeof getBriefingData>> | null = null
  let lastSyncedAt: string | null = null
  let alerts: Alert[] = []
  let onboarding: OnboardingSnapshot | null = null
  let departments: DepartmentMovement[] = []
  let movements: RecentMovement[] = []
  let managers: ManagerActivity[] = []
  let stageDeltas: StageDelta[] = []
  let error: string | null = null
  try {
    ;[data, lastSyncedAt, alerts, onboarding, departments, movements, managers, stageDeltas] = await Promise.all([
      getBriefingData(),
      getLastSyncedAt(),
      getCurrentAlerts(),
      getOnboardingSnapshot().catch(() => null),
      getDepartmentMovements().catch(() => []),
      getRecentMovements(12).catch(() => []),
      getManagerActivity().catch(() => []),
      getStageDeltas(1).catch(() => []),
    ])
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const standbyAlerts = alerts.filter(a => a.type === 'standby_unassigned')
  const ptoAlerts = alerts.filter(a => a.type === 'pto_overdue')

  // Pages starting within 7 days that aren't on the chatter schedule yet (no POD/team).
  const unscheduledOnboardings = (onboarding?.models ?? [])
    .map(m => {
      if (m.pod || m.team || m.chattersAlreadyAssigned > 0) return null
      if (m.daysUntilStart === null || m.daysUntilStart > 7) return null
      const severity: 'critical' | 'warning' = m.daysUntilStart <= 3 ? 'critical' : 'warning'
      return { model: m, severity }
    })
    .filter((x): x is { model: ModelWithCapacity; severity: 'critical' | 'warning' } => x !== null)

  // Pages starting today or tomorrow (need to be on someone's radar regardless of schedule status)
  const startingSoon = (onboarding?.models ?? []).filter(m => m.daysUntilStart !== null && m.daysUntilStart <= 2)

  const narrative = data
    ? buildNarrative(data, { startingSoon: startingSoon.length, unscheduled: unscheduledOnboardings.length, shortBy: onboarding?.shortBy ?? 0 })
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
          {/* Standby SLA */}
          {standbyAlerts.length > 0 && (() => {
            const critical = standbyAlerts.filter(a => a.severity === 'critical').length
            const warning = standbyAlerts.filter(a => a.severity === 'warning').length
            const summary = [
              critical > 0 ? `${critical} critical` : null,
              warning > 0 ? `${warning} warning` : null,
            ].filter(Boolean).join(' · ')
            return (
              <Accordion title="Standby — needs page assignment" summary={summary} accent={critical > 0 ? 'var(--red)' : 'var(--amber)'}>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  {standbyAlerts.length} {standbyAlerts.length === 1 ? 'chatter is' : 'chatters are'} on standby with no BOARD assigned. They&apos;ll quit if they sit too long.
                  {' '}<Link href="/standby" style={{ color: 'var(--text-3)' }}>See all →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {standbyAlerts.slice(0, 10).map((a, i) => (
                    <AlertRow key={a.id} alert={a} num={String(i + 1).padStart(2, '0')} />
                  ))}
                  {standbyAlerts.length > 10 && (
                    <Link href="/standby" style={{
                      fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0',
                      fontStyle: 'italic', textDecoration: 'none', display: 'block',
                      borderRadius: 6, background: 'var(--surface-2)',
                    }}>
                      +{standbyAlerts.length - 10} more on /standby →
                    </Link>
                  )}
                </div>
              </Accordion>
            )
          })()}

          {/* Onboarding alerts */}
          {unscheduledOnboardings.length > 0 && (() => {
            const critical = unscheduledOnboardings.filter(u => u.severity === 'critical').length
            const warning = unscheduledOnboardings.filter(u => u.severity === 'warning').length
            const summary = [
              critical > 0 ? `${critical} critical` : null,
              warning > 0 ? `${warning} warning` : null,
            ].filter(Boolean).join(' · ')
            return (
              <Accordion title="Onboarding — pages with no schedule" summary={summary} accent={critical > 0 ? 'var(--red)' : 'var(--amber)'}>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  {unscheduledOnboardings.length} {unscheduledOnboardings.length === 1 ? 'page is' : 'pages are'} launching within 7 days but not on the chatter schedule.{' '}
                  <Link href="/onboarding" style={{ color: 'var(--text-3)' }}>See all →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {unscheduledOnboardings.map((u, i) => (
                    <OnboardingRow key={u.model.id} model={u.model} severity={u.severity} num={String(i + 1).padStart(2, '0')} />
                  ))}
                </div>
              </Accordion>
            )
          })()}

          {/* Onboarding coverage */}
          {onboarding && (onboarding.shortBy > 0 || onboarding.models.length > 0) && (
            <Accordion
              title="Onboarding coverage"
              summary={onboarding.shortBy > 0 ? `short ${onboarding.shortBy} chatter${onboarding.shortBy === 1 ? '' : 's'}` : 'covered'}
              accent={onboarding.shortBy > 0 ? 'var(--red)' : 'var(--green)'}
            >
              <div style={{
                background: 'var(--surface-2)',
                border: `1px solid ${onboarding.shortBy > 0 ? 'rgba(239,68,68,0.22)' : 'var(--border)'}`,
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                  {onboarding.shortBy > 0 ? (
                    <>
                      <strong style={{ color: 'var(--red)' }}>Short {onboarding.shortBy} chatter{onboarding.shortBy === 1 ? '' : 's'}</strong>
                      {' '}across {onboarding.models.length} upcoming page{onboarding.models.length === 1 ? '' : 's'}.
                      {' '}{onboarding.availableStandby} on standby, {onboarding.totalStillNeeded} still needed.
                    </>
                  ) : (
                    <>
                      <strong style={{ color: 'var(--green)' }}>Covered.</strong>
                      {' '}{onboarding.availableStandby} on standby, {onboarding.totalStillNeeded} still needed.
                    </>
                  )}
                </div>
                <Link href="/onboarding" style={{
                  fontSize: 11.5, padding: '6px 12px', borderRadius: 6,
                  background: 'var(--surface-3)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', textDecoration: 'none', whiteSpace: 'nowrap',
                }}>Open onboarding →</Link>
              </div>
            </Accordion>
          )}

          {/* PTO */}
          {ptoAlerts.length > 0 && (
            <Accordion title="Personal Time Off — decision time" summary={`${ptoAlerts.length} overdue`} accent="var(--amber)">
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                {ptoAlerts.length} {ptoAlerts.length === 1 ? 'person has' : 'people have'} been in PTO for 2+ weeks. Time to let go.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ptoAlerts.map((a, i) => (
                  <AlertRow key={a.id} alert={a} num={String(i + 1).padStart(2, '0')} />
                ))}
              </div>
            </Accordion>
          )}

          {/* The numbers — expanded with 24h + now snapshot */}
          {(() => {
            const totals = departments.reduce(
              (acc, d) => ({
                inPipeline: acc.inPipeline + d.inPipeline,
                newLast24h: acc.newLast24h + d.newLast24h,
                transitions24h: acc.transitions24h + d.transitions24h,
                enteredTraining: acc.enteredTraining + d.enteredTraining24h,
                enteredStandby: acc.enteredStandby + d.enteredStandby24h,
                enteredActive: acc.enteredActive + d.enteredActive24h,
                offboarded: acc.offboarded + d.offboarded24h,
              }),
              { inPipeline: 0, newLast24h: 0, transitions24h: 0, enteredTraining: 0, enteredStandby: 0, enteredActive: 0, offboarded: 0 },
            )
            const summary = `+${totals.newLast24h} new · ${totals.transitions24h} changes (24h)`
            return (
              <Accordion title="The numbers" summary={summary}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-4)', fontWeight: 600, marginBottom: 12 }}>Pipeline now</div>
                    <StatLine label="In pipeline" value={totals.inPipeline} />
                    <StatLine label="In interviews" value={data.interviews} href="/?interviews=1" />
                    <StatLine label="In training (Tier 1–2)" value={data.atRiskInTraining.length} color="var(--amber)" />
                    <StatLine label="Top tier" value={data.topTierTotal} color="var(--green)" href="/top-performers" />
                    <StatLine label="At risk total" value={data.atRiskTotal} color="var(--red)" href="/at-risk" last />
                  </div>
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-4)', fontWeight: 600, marginBottom: 12 }}>Last 24h</div>
                    <StatLine label="New candidates" value={totals.newLast24h} prefix="+" color="var(--green)" />
                    <StatLine label="Entered training" value={totals.enteredTraining} prefix="↑" color="var(--blue)" />
                    <StatLine label="Entered standby" value={totals.enteredStandby} prefix="→" color="var(--violet)" />
                    <StatLine label="Entered active" value={totals.enteredActive} prefix="✓" color="var(--green)" />
                    <StatLine label="Offboarded" value={totals.offboarded} prefix="−" color="var(--red)" last />
                  </div>
                </div>
              </Accordion>
            )
          })()}

          {/* Departments */}
          {departments.length > 0 && (() => {
            const summary = departments.map(d => `${d.region} ${d.inPipeline}`).join(' · ')
            return (
              <Accordion title="Departments" summary={summary}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {departments.map(d => <DepartmentRow key={d.region} dept={d} />)}
                </div>
              </Accordion>
            )
          })()}

          {/* Stage movement — day-over-day deltas per (region, stage) */}
          {stageDeltas.length > 0 && (() => {
            const drops = stageDeltas.filter(d => d.delta < 0)
            const biggestDrop = drops.reduce((min, d) => Math.min(min, d.delta), 0)
            const totalDrop = drops.reduce((s, d) => s + d.delta, 0)
            const summary = drops.length > 0
              ? `${drops.length} stage${drops.length === 1 ? '' : 's'} dropped (${totalDrop})`
              : `${stageDeltas.length} change${stageDeltas.length === 1 ? '' : 's'}`
            return (
              <Accordion title="Stage movement — vs yesterday" summary={summary} accent={biggestDrop <= -5 ? 'var(--red)' : biggestDrop < 0 ? 'var(--amber)' : undefined}>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  How each stage&apos;s headcount shifted overnight. Drops mean people left the stage — either moved forward or dropped out.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stageDeltas.slice(0, 20).map((d, i) => (
                    <StageDeltaRow key={`${d.region}-${d.stage}-${i}`} delta={d} />
                  ))}
                  {stageDeltas.length > 20 && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-4)', fontStyle: 'italic', textAlign: 'center', padding: '6px 0' }}>
                      +{stageDeltas.length - 20} more smaller changes
                    </div>
                  )}
                </div>
              </Accordion>
            )
          })()}

          {/* Managers — per-person 24h activity */}
          {managers.length > 0 && (() => {
            const active = managers.filter(m => m.transitions24h > 0 || m.newLast24h > 0).length
            const totalChanges = managers.reduce((s, m) => s + m.transitions24h, 0)
            return (
              <Accordion title="Managers — last 24h" summary={`${active} active · ${totalChanges} change${totalChanges === 1 ? '' : 's'}`}>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  Who moved what yesterday, by manager. <Link href="/managers" style={{ color: 'var(--text-3)' }}>Open managers →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {managers.map(m => <ManagerRow key={m.name} manager={m} />)}
                </div>
              </Accordion>
            )
          })()}

          {/* Training board — pulled from Allyson + training stages */}
          {(() => {
            const trainingTransitions = departments.reduce((s, d) => s + d.enteredTraining24h, 0)
            const standbyFromTraining = departments.reduce((s, d) => s + d.enteredStandby24h, 0)
            const activeFromTraining = departments.reduce((s, d) => s + d.enteredActive24h, 0)
            const allysonActivity = managers.find(m => m.name === 'Allyson Sam')
            const summary = `+${trainingTransitions} entered · ${data.atRiskInTraining.length} at risk`
            return (
              <Accordion title="Training board" summary={summary} accent={data.atRiskInTraining.length > 0 ? 'var(--amber)' : undefined}>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-4)', fontWeight: 600, marginBottom: 10 }}>Training flow · 24h</div>
                  <StatLine label="Entered training" value={trainingTransitions} prefix="↑" color="var(--blue)" />
                  <StatLine label="Moved training → standby" value={standbyFromTraining} prefix="→" color="var(--violet)" />
                  <StatLine label="Moved training → active" value={activeFromTraining} prefix="✓" color="var(--green)" />
                  <StatLine label="At-risk currently in training" value={data.atRiskInTraining.length} color="var(--amber)" last />
                </div>
                {allysonActivity && (allysonActivity.transitions24h > 0 || allysonActivity.candidatesAssigned > 0) && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-4)', fontWeight: 600, marginBottom: 8 }}>Allyson Sam · Head of Training</div>
                    <ManagerRow manager={allysonActivity} />
                  </div>
                )}
              </Accordion>
            )
          })()}

          {/* Recent movements */}
          {movements.length > 0 && (
            <Accordion title="Recent movements" summary={`${movements.length} change${movements.length === 1 ? '' : 's'}`}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                Last {movements.length} stage change{movements.length === 1 ? '' : 's'} across the org. <Link href="/activity" style={{ color: 'var(--text-3)' }}>Full log →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {movements.map(m => <MovementRow key={m.id} movement={m} />)}
              </div>
            </Accordion>
          )}

          {/* At risk in training */}
          <Accordion
            title="At risk in training"
            summary={data.atRiskInTraining.length === 0 ? 'none' : `${data.atRiskInTraining.length} candidate${data.atRiskInTraining.length === 1 ? '' : 's'}`}
            accent={data.atRiskInTraining.length > 0 ? 'var(--amber)' : undefined}
          >
            {data.atRiskInTraining.length === 0 ? (
              <Empty>No at-risk candidates currently in training. Nothing flagged.</Empty>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  {data.atRiskInTraining.length} Tier 1–2 {data.atRiskInTraining.length === 1 ? 'candidate is' : 'candidates are'} in training — closer look before they slip.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.atRiskInTraining.map((c, i) => (
                    <CandidateRow key={c.id} candidate={c} num={String(i + 1).padStart(2, '0')} accent="var(--amber)" />
                  ))}
                </div>
              </>
            )}
          </Accordion>

          {/* Top tier */}
          <Accordion
            title="Top tier — recognize them"
            summary={data.topTier.length === 0 ? `${data.topTierTotal} total` : `${data.topTier.length} Tier 4`}
            accent={data.topTier.length > 0 ? 'var(--green)' : undefined}
          >
            {data.topTier.length === 0 ? (
              <Empty>
                No Tier 4 candidates in the pipeline right now.
                {data.topTierTotal > 0 && ` ${data.topTierTotal} candidates are Tier 3 — see Top performers.`}
              </Empty>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  {data.topTier.length} {data.topTier.length === 1 ? 'candidate is' : 'candidates are'} at the top tier — worth a word of recognition.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.topTier.map((c, i) => (
                    <CandidateRow key={c.id} candidate={c} num={String(i + 1).padStart(2, '0')} accent="var(--green)" />
                  ))}
                </div>
              </>
            )}
          </Accordion>
        </>
      )}

      <div style={{ textAlign: 'center', padding: '32px 24px', borderTop: '1px solid var(--border)', marginTop: 36, color: 'var(--text-3)', fontSize: 13, fontStyle: 'italic', lineHeight: 1.6 }}>
        Read this once. Then go open the dashboard.
      </div>
    </div>
  )
}

function buildNarrative(
  d: Awaited<ReturnType<typeof getBriefingData>>,
  onboarding: { startingSoon: number; unscheduled: number; shortBy: number },
): string {
  const parts: string[] = []
  if (d.newLast24h > 0) parts.push(`${d.newLast24h} new candidate${d.newLast24h === 1 ? '' : 's'} entered the pipeline`)
  if (d.transitions24h > 0) parts.push(`${d.transitions24h} stage change${d.transitions24h === 1 ? '' : 's'} recorded`)
  const lead = parts.length > 0
    ? `In the last 24 hours: ${parts.join(' and ')}.`
    : 'No new candidates or stage changes in the last 24 hours.'

  const tails: string[] = []
  if (onboarding.startingSoon > 0) {
    tails.push(`${onboarding.startingSoon} page${onboarding.startingSoon === 1 ? '' : 's'} start${onboarding.startingSoon === 1 ? 's' : ''} in the next 2 days`)
  }
  if (onboarding.unscheduled > 0) {
    tails.push(`${onboarding.unscheduled} upcoming page${onboarding.unscheduled === 1 ? ' is' : 's are'} not yet on the chatter schedule`)
  }
  if (onboarding.shortBy > 0) {
    tails.push(`onboarding is short ${onboarding.shortBy} chatter${onboarding.shortBy === 1 ? '' : 's'}`)
  }
  if (d.atRiskInTraining.length > 0) {
    tails.push(`${d.atRiskInTraining.length} at-risk candidate${d.atRiskInTraining.length === 1 ? '' : 's'} in training need${d.atRiskInTraining.length === 1 ? 's' : ''} attention`)
  }
  return tails.length > 0 ? `${lead} ${tails.join('. ').replace(/\.$/, '')}.` : lead
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

function Accordion({ title, summary, accent, defaultOpen, children }: { title: string; summary?: string; accent?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} style={{ marginBottom: 10 }}>
      <summary style={{
        cursor: 'pointer',
        padding: '14px 18px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {accent && <span style={{ width: 4, height: 16, background: accent, borderRadius: 2, flexShrink: 0 }} />}
          <Caret />
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</span>
        </span>
        {summary && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {summary}
          </span>
        )}
      </summary>
      <div style={{ padding: '14px 4px 6px' }}>
        {children}
      </div>
    </details>
  )
}

function Caret() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10, color: 'var(--text-3)', flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

function StatLine({ label, value, color, prefix, href, last }: { label: string; value: number; color?: string; prefix?: string; href?: string; last?: boolean }) {
  const body = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0',
      borderBottom: last ? 'none' : '1px solid var(--border)',
      cursor: href ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 13.5, fontWeight: 600, color: color || 'var(--text)' }}>
        {prefix ? <span style={{ color, marginRight: 2 }}>{prefix}</span> : null}{value.toLocaleString()}
      </div>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{body}</Link> : body
}

function NumberCard({ value, label, color, href }: { value: number; label: string; color?: string; href?: string }) {
  const card = (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: 14, textAlign: 'center', cursor: href ? 'pointer' : 'default', height: '100%',
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4, color: color || 'var(--text)' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
    </div>
  )
  return href
    ? <Link href={href} scroll={!href.startsWith('/?')} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{card}</Link>
    : card
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

const REGION_LABEL: Record<Region, { flag: string; name: string }> = {
  PH: { flag: '🇵🇭', name: 'Philippines' },
  EU: { flag: '🇪🇺', name: 'Europe' },
  SA: { flag: '🇨🇴', name: 'South America' },
  UK: { flag: '🇬🇧', name: 'United Kingdom' },
}

const DEPT_SLUG: Record<Region, string> = { PH: 'ph', EU: 'eu', SA: 'sa', UK: 'uk' }

function DepartmentRow({ dept }: { dept: DepartmentMovement }) {
  const label = REGION_LABEL[dept.region]
  const hasActivity = dept.transitions24h > 0 || dept.newLast24h > 0
  return (
    <Link href={`/departments/${DEPT_SLUG[dept.region]}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '12px 16px',
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 14,
        cursor: 'pointer',
      }}>
        <div style={{ fontSize: 18, lineHeight: 1, width: 22, textAlign: 'center' }}>{label.flag}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3 }}>
            {label.name} <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-3)', fontWeight: 400, marginLeft: 4 }}>· {dept.inPipeline.toLocaleString()} in pipeline</span>
          </div>
          <div style={{ fontSize: 11.5, color: hasActivity ? 'var(--text-3)' : 'var(--text-4)', fontFamily: 'monospace', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {dept.newLast24h > 0 && <span><span style={{ color: 'var(--green)' }}>+{dept.newLast24h}</span> new</span>}
            {dept.enteredTraining24h > 0 && <span><span style={{ color: 'var(--blue)' }}>↑{dept.enteredTraining24h}</span> to training</span>}
            {dept.enteredStandby24h > 0 && <span><span style={{ color: 'var(--violet)' }}>→{dept.enteredStandby24h}</span> standby</span>}
            {dept.enteredActive24h > 0 && <span><span style={{ color: 'var(--green)' }}>✓{dept.enteredActive24h}</span> active</span>}
            {dept.offboarded24h > 0 && <span><span style={{ color: 'var(--red)' }}>−{dept.offboarded24h}</span> offboarded</span>}
            {!hasActivity && <span style={{ fontStyle: 'italic' }}>no movement</span>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', textAlign: 'right' }}>
          {dept.transitions24h > 0 ? `${dept.transitions24h} change${dept.transitions24h === 1 ? '' : 's'}` : ''}
        </div>
      </div>
    </Link>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function prettyStage(stage: string | null): string {
  if (!stage) return 'new'
  return stage.replace(/_/g, ' ')
}

function StageDeltaRow({ delta }: { delta: StageDelta }) {
  const region = REGION_LABEL[delta.region]
  const isDrop = delta.delta < 0
  const isBigDrop = delta.delta <= -5
  const deltaColor = isBigDrop ? 'var(--red)' : isDrop ? 'var(--amber)' : 'var(--green)'
  const sign = delta.delta > 0 ? '+' : ''
  // Link to the segment modal so the operator can drill into who's in there now.
  const segment = `${delta.region.toLowerCase()}:${uiBucketForStage(delta.stage)}`
  return (
    <Link href={`/?segment=${encodeURIComponent(segment)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 14px',
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', alignItems: 'center', gap: 14,
        cursor: 'pointer',
        borderLeft: isBigDrop ? '2px solid var(--red)' : isDrop ? '2px solid var(--amber)' : '2px solid var(--green)',
      }}>
        <div style={{ fontSize: 13, lineHeight: 1, width: 18, textAlign: 'center' }}>{region.flag}</div>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{delta.groupTitle}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {delta.yesterdayCount} → {delta.todayCount}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: deltaColor, whiteSpace: 'nowrap', minWidth: 44, textAlign: 'right' }}>
          {sign}{delta.delta}
        </div>
      </div>
    </Link>
  )
}

// Map canonical stage → UI bucket for /?segment= deep link
function uiBucketForStage(stage: string): string {
  switch (stage) {
    case 'typeform': return 'typeform'
    case 'passed_typeform': return 'passed'
    case 'pending_interview': return 'pending'
    case 'scheduled_interview': case 'pending_onboarding': case 'pending_week_1': return 'scheduled'
    case 'week_1_training': case 'week_2_training': case 'week_3_training': case 'training_board': return 'training'
    case 'pool': case 'standby': return 'standby'
    case 'active': case 'promoted': case 'pto': return 'active'
    default: return 'all'
  }
}

function ManagerRow({ manager }: { manager: ManagerActivity }) {
  const hasActivity = manager.transitions24h > 0 || manager.newLast24h > 0
  return (
    <Link href={`/managers?focus=${encodeURIComponent(manager.name)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 14px',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto', alignItems: 'center', gap: 14,
        cursor: 'pointer',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manager.displayName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{manager.role}</div>
        </div>
        <div style={{ fontSize: 11.5, color: hasActivity ? 'var(--text-3)' : 'var(--text-4)', fontFamily: 'monospace', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {manager.newLast24h > 0 && <span><span style={{ color: 'var(--green)' }}>+{manager.newLast24h}</span> new</span>}
          {manager.enteredTraining24h > 0 && <span><span style={{ color: 'var(--blue)' }}>↑{manager.enteredTraining24h}</span> training</span>}
          {manager.enteredStandby24h > 0 && <span><span style={{ color: 'var(--violet)' }}>→{manager.enteredStandby24h}</span> standby</span>}
          {manager.enteredActive24h > 0 && <span><span style={{ color: 'var(--green)' }}>✓{manager.enteredActive24h}</span> active</span>}
          {manager.offboarded24h > 0 && <span><span style={{ color: 'var(--red)' }}>−{manager.offboarded24h}</span> off</span>}
          {!hasActivity && <span style={{ fontStyle: 'italic' }}>no activity</span>}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'monospace', textAlign: 'right' }}>
          {manager.candidatesAssigned.toLocaleString()} assigned
        </div>
      </div>
    </Link>
  )
}

function MovementRow({ movement }: { movement: RecentMovement }) {
  const region = REGION_LABEL[movement.region]
  return (
    <CandidateLink id={movement.candidateId} block>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }}>
        <div style={{ fontSize: 13, lineHeight: 1, width: 18, textAlign: 'center' }}>{region.flag}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{movement.candidateName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{prettyStage(movement.fromStage)}</span>
            <span style={{ color: 'var(--text-4)' }}>→</span>
            <span style={{ color: 'var(--text-2)' }}>{prettyStage(movement.toStage)}</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{timeAgo(movement.detectedAt)}</div>
      </div>
    </CandidateLink>
  )
}

function OnboardingRow({ model, severity, num }: { model: ModelWithCapacity; severity: 'critical' | 'warning'; num: string }) {
  const accent = severity === 'critical' ? 'var(--red)' : 'var(--amber)'
  const startLabel = (() => {
    if (model.daysUntilStart === null) return '—'
    if (model.daysUntilStart === 0) return 'today'
    if (model.daysUntilStart === 1) return 'tomorrow'
    return `in ${model.daysUntilStart}d`
  })()
  return (
    <Link href="/onboarding" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'center',
        borderLeft: `2px solid ${accent}`, cursor: 'pointer',
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-4)', width: 18, flexShrink: 0 }}>{num}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{model.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Starts {startLabel}
            {model.revenue ? ` · $${(model.revenue / 1000).toFixed(model.revenue % 1000 === 0 ? 0 : 1)}k` : ''}
            {model.board ? ` · ${model.board}` : ''}
          </div>
        </div>
        <span style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
          padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
          background: severity === 'critical' ? 'rgba(239,68,68,0.10)' : 'rgba(251,191,36,0.10)',
          color: accent,
        }}>{severity === 'critical' ? 'critical' : 'warning'}</span>
      </div>
    </Link>
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
