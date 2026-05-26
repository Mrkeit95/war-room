import Link from 'next/link'
import CandidateLink from '@/components/CandidateLink'
import { gradeBg, gradeColors } from '@/lib/candidates'
import { getDashboardStats, listCandidates, type DbCandidate } from '@/lib/db'
import type { UiBucket } from '@/lib/stages'

export const dynamic = 'force-dynamic'

type Bucket = Exclude<UiBucket, null>

const STAGE_DISPLAY: { key: Bucket; label: string }[] = [
  { key: 'typeform', label: 'Typeform' },
  { key: 'passed', label: 'Passed' },
  { key: 'pending', label: 'Pending interview' },
  { key: 'scheduled', label: 'Scheduled / pending start' },
  { key: 'training', label: 'Training' },
  { key: 'standby', label: 'Standby' },
  { key: 'active', label: 'Active' },
]

const CARDS_PER_COLUMN = 8

export default async function PipelinePage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null
  const cardsByBucket: Record<Bucket, DbCandidate[]> = {
    typeform: [], passed: [], pending: [], scheduled: [], training: [], standby: [], active: [],
  }
  let dataError: string | null = null

  try {
    stats = await getDashboardStats()
    // Fetch top-N candidates per bucket in parallel
    const buckets: Bucket[] = ['typeform', 'passed', 'pending', 'scheduled', 'training', 'standby', 'active']
    const fetched = await Promise.all(buckets.map(b => listCandidates({ bucket: b, limit: CARDS_PER_COLUMN })))
    buckets.forEach((b, i) => { cardsByBucket[b] = fetched[i] })
  } catch (err) {
    dataError = err instanceof Error ? err.message : String(err)
  }

  const totalCount = (b: Bucket) => {
    if (!stats) return 0
    return stats.byRegion.PH[b] + stats.byRegion.EU[b] + stats.byRegion.SA[b] + stats.byRegion.UK[b]
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Pipeline</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Every candidate across every region in motion.</div>
      </div>

      {dataError && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
          Couldn&apos;t load live data: {dataError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(170px, 1fr))', gap: 10, overflowX: 'auto', paddingBottom: 20 }}>
        {STAGE_DISPLAY.map(stage => {
          const count = totalCount(stage.key)
          const cards = cardsByBucket[stage.key]
          return (
            <div key={stage.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 600 }}>{stage.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)', background: 'var(--surface-3)', padding: '2px 7px', borderRadius: 10 }}>{count.toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cards.map(card => <Card key={card.id} candidate={card} />)}
                {cards.length === 0 && (
                  <div style={{ color: 'var(--text-4)', fontSize: 11, padding: '8px 0', fontStyle: 'italic' }}>No visible candidates</div>
                )}
                {count > cards.length && (
                  <Link
                    href={`/candidates?bucket=${stage.key}`}
                    style={{
                      fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0',
                      fontStyle: 'italic', textDecoration: 'none', display: 'block',
                      borderRadius: 6, background: 'var(--surface-2)', marginTop: 2,
                    }}
                  >
                    +{(count - cards.length).toLocaleString()} more →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ candidate }: { candidate: DbCandidate }) {
  const grade = candidate.tier && /^[A-F]$/i.test(candidate.tier) ? candidate.tier.toUpperCase() : null
  return (
    <CandidateLink id={candidate.id} block>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {grade ? (
            <div style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, background: gradeBg[grade], color: gradeColors[grade] }}>{grade}</div>
          ) : (
            <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--surface-3)', flexShrink: 0 }} />
          )}
          <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.name}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 10 }}>{candidate.region}</span>
          {candidate.assigned_manager && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{candidate.assigned_manager}</span>
          )}
        </div>
      </div>
    </CandidateLink>
  )
}
