import Link from 'next/link'
import { getBoardsBreakdown, slugifyBoard, type BoardEntry } from '@/lib/boards'
import { BOARD_TO_AE } from '@/lib/manager_sections'

export const dynamic = 'force-dynamic'

export default async function BoardsPage() {
  let boards: BoardEntry[]
  try {
    boards = await getBoardsBreakdown()
  } catch (err) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Boards</h1>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, fontSize: 12.5, color: 'var(--red)' }}>
          Failed to load: {err instanceof Error ? err.message : String(err)}
        </div>
      </div>
    )
  }

  const totals = boards.reduce(
    (acc, b) => ({
      pods: acc.pods + b.podCount,
      pages: acc.pages + b.pageCount,
      chatters: acc.chatters + b.chatterCount,
    }),
    { pods: 0, pages: 0, chatters: 0 },
  )

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Boards</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          PODs, teams, pages, and chatters grouped by AE board. Inferred from the chatter schedule + each chatter&apos;s board assignment.
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 8, fontFamily: 'monospace' }}>
          {boards.length} boards · {totals.pods} pods · {totals.pages} pages · {totals.chatters} chatter slots
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {boards.map(b => (
          <BoardCard key={b.board} board={b} />
        ))}
      </div>
    </div>
  )
}

function BoardCard({ board }: { board: BoardEntry }) {
  const ae = BOARD_TO_AE[board.board.toUpperCase()] ?? null
  const isUnassigned = board.board === 'Unassigned'
  return (
    <Link href={`/boards/${slugifyBoard(board.board)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--surface)',
        border: `1px solid ${isUnassigned ? 'rgba(251,191,36,0.28)' : 'var(--border)'}`,
        borderRadius: 14, padding: '20px 22px',
        cursor: 'pointer', height: '100%',
        transition: 'border-color 120ms',
      }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>
          {board.board}
        </div>
        <div style={{ fontSize: 13.5, color: ae ? 'var(--text)' : 'var(--text-4)', fontWeight: 500, marginBottom: 18 }}>
          {ae ?? (isUnassigned ? 'No board on chatter records' : '—')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <Stat label="Pods" value={board.podCount} />
          <Stat label="Pages" value={board.pageCount} />
          <Stat label="Chatters" value={board.chatterCount} />
        </div>
      </div>
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, lineHeight: 1, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)', fontWeight: 500, marginTop: 4 }}>{label}</div>
    </div>
  )
}
