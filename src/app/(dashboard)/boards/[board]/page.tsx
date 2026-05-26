import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBoardsBreakdown, unslugifyBoard, type PodEntry, type TeamEntry } from '@/lib/boards'
import { BOARD_TO_AE } from '@/lib/manager_sections'
import CandidateLink from '@/components/CandidateLink'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function BoardDetailPage({ params }: { params: Promise<{ board: string }> }) {
  const { board: slug } = await params
  const target = unslugifyBoard(slug)
  if (!target) notFound()

  const [boards, chatterIdMap] = await Promise.all([
    getBoardsBreakdown(),
    getChatterIdMap(),
  ])
  const board = boards.find(b => b.board === target)
  if (!board) {
    return (
      <div>
        <BackLink />
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>{target}</h1>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, fontSize: 13, color: 'var(--text-3)' }}>
          No pods or chatters assigned to this board yet.
        </div>
      </div>
    )
  }

  const ae = BOARD_TO_AE[board.board.toUpperCase()] ?? null

  return (
    <div>
      <BackLink />
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>{board.board}</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          {ae ?? '—'} · {board.podCount} pod{board.podCount === 1 ? '' : 's'} · {board.pageCount} page{board.pageCount === 1 ? '' : 's'} · {board.chatterCount} chatter{board.chatterCount === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {board.pods.map(pod => (
          <PodPanel key={pod.pod} pod={pod} chatterIdMap={chatterIdMap} />
        ))}
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/boards" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 18 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      All boards
    </Link>
  )
}

function PodPanel({ pod, chatterIdMap }: { pod: PodEntry; chatterIdMap: Map<string, string> }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>POD {pod.pod}</div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace' }}>
          {pod.teams.length} team{pod.teams.length === 1 ? '' : 's'} · {pod.chatterCount} chatter{pod.chatterCount === 1 ? '' : 's'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {pod.teams.map((t, i) => (
          <TeamRow key={t.team} team={t} chatterIdMap={chatterIdMap} isLast={i === pod.teams.length - 1} />
        ))}
      </div>
    </div>
  )
}

function TeamRow({ team, chatterIdMap, isLast }: { team: TeamEntry; chatterIdMap: Map<string, string>; isLast: boolean }) {
  return (
    <div style={{
      padding: '12px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <span style={{
          fontSize: 10, padding: '3px 8px', borderRadius: 4,
          background: 'var(--surface-3)', color: 'var(--text-2)',
          fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.06em',
        }}>{team.team}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {team.pages.map(p => (
            <span key={p.pageName} style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{p.pageName}</span>
          )).reduce<React.ReactNode[]>((acc, el, i) => {
            if (i > 0) acc.push(<span key={`sep-${i}`} style={{ color: 'var(--text-4)' }}>·</span>)
            acc.push(el)
            return acc
          }, [])}
        </div>
      </div>
      <div style={{ paddingLeft: 36 }}>
        {team.pages.map(p => (
          <div key={p.pageName} style={{ marginBottom: 6 }}>
            {p.chatters.length === 0 ? (
              <span style={{ fontSize: 11.5, color: 'var(--text-4)', fontStyle: 'italic' }}>
                No chatters on {p.pageName}
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {p.chatters.map(c => {
                  const candidateId = chatterIdMap.get(c.name)
                  const chip = (
                    <span style={{
                      fontSize: 11.5, padding: '3px 9px', borderRadius: 4,
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      color: 'var(--text)',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      cursor: candidateId ? 'pointer' : 'default',
                    }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      <span style={{ color: 'var(--text-4)', fontSize: 10, fontFamily: 'monospace' }}>{c.shifts.length}×</span>
                    </span>
                  )
                  return candidateId
                    ? <CandidateLink key={c.name} id={candidateId} block={false}>{chip}</CandidateLink>
                    : <span key={c.name}>{chip}</span>
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Map chatter name → candidate id so we can deep-link into the candidate modal.
 */
async function getChatterIdMap(): Promise<Map<string, string>> {
  const supabase = createAdminClient()
  const map = new Map<string, string>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('candidates')
      .select('id, name')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`getChatterIdMap: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data as { id: string; name: string }[]) {
      if (!map.has(row.name)) map.set(row.name, row.id)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return map
}
