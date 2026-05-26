import Link from 'next/link'
import { getBoardsBreakdown, slugifyBoard, type BoardEntry } from '@/lib/boards'
import { BOARD_TO_AE } from '@/lib/manager_sections'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function getBoardsDiagnostics() {
  const supabase = createAdminClient()
  const { count, error } = await supabase.from('board_groups').select('id', { count: 'exact', head: true })
  return {
    boardGroupsCount: error ? null : (count ?? 0),
    boardGroupsTableMissing: !!error && /relation .* does not exist/i.test(error.message),
    error: error ? error.message : null,
  }
}

export default async function BoardsPage() {
  let boards: BoardEntry[]
  const diagnostics = await getBoardsDiagnostics()
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
  const allUnmapped = boards.length === 1 && boards[0].board === 'Unmapped'

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Boards</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          PODs, teams, pages, and chatters grouped by AE board. Mapping comes from the 4 AE board layouts on Monday (BOARD 1/2/3/TRAINING BOARD).
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 8, fontFamily: 'monospace' }}>
          {totals.pods} pods · {totals.pages} pages · {totals.chatters} chatters · {diagnostics.boardGroupsCount ?? '?'} pod-team mappings in db
        </div>
      </div>

      {diagnostics.boardGroupsTableMissing && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--red)' }}>board_groups table missing.</strong> Run migration 0006_board_groups.sql in Supabase, then come back to /onboarding and click Sync now.
        </div>
      )}
      {!diagnostics.boardGroupsTableMissing && diagnostics.boardGroupsCount === 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.28)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--amber)' }}>No board-group mappings yet.</strong> The board_groups table exists but is empty — the Monday sync hasn&apos;t populated it. Go to <Link href="/onboarding" style={{ color: 'var(--blue)' }}>/onboarding</Link> and click <strong>Sync now</strong>. If it still shows zero after a successful sync, the Monday API token can&apos;t reach the 4 AE boards.
        </div>
      )}
      {allUnmapped && diagnostics.boardGroupsCount && diagnostics.boardGroupsCount > 0 ? (
        <div style={{
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.28)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 18,
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--amber)' }}>Board mappings exist ({diagnostics.boardGroupsCount}) but none match the chatter schedule&apos;s pod/team values.</strong> Either the group titles parse differently on the AE boards vs. the chatter schedule, or pod/team names disagree.
        </div>
      ) : null}

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
