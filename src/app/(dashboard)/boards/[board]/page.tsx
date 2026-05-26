import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBoardsBreakdown, unslugifyBoard } from '@/lib/boards'
import { BOARD_TO_AE } from '@/lib/manager_sections'
import PodPanel from './PodPanel'

export const dynamic = 'force-dynamic'

export default async function BoardDetailPage({ params }: { params: Promise<{ board: string }> }) {
  const { board: slug } = await params
  const target = unslugifyBoard(slug)
  if (!target) notFound()

  const boards = await getBoardsBreakdown()
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
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 6, fontStyle: 'italic' }}>
          Click a POD to open the full shift schedule for its teams.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {board.pods.map(pod => (
          <PodPanel key={pod.pod} pod={pod} />
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
