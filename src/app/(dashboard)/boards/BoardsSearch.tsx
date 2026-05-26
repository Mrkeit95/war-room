'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { BoardEntry } from '@/lib/boards'
import { slugifyBoard } from '@/lib/boards'

type Hit = {
  board: string
  boardSlug: string
  pod: string
  team?: string
  page?: string
  chatter?: string
  manager?: string
  // What matched: the line we render
  primary: string
  secondary: string
}

export default function BoardsSearch({ boards }: { boards: BoardEntry[] }) {
  const [q, setQ] = useState('')

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return null
    const matches: Hit[] = []
    for (const b of boards) {
      const boardSlug = slugifyBoard(b.board)
      for (const pod of b.pods) {
        if (pod.manager && pod.manager.toLowerCase().includes(needle)) {
          matches.push({
            board: b.board, boardSlug, pod: pod.pod,
            primary: `Manager: ${pod.manager}`,
            secondary: `${b.board} · POD ${pod.pod} · ${pod.teams.length} team${pod.teams.length === 1 ? '' : 's'}`,
          })
        }
        for (const team of pod.teams) {
          // Page hits
          for (const p of team.pageNames) {
            if (p.toLowerCase().includes(needle)) {
              matches.push({
                board: b.board, boardSlug, pod: pod.pod, team: team.team, page: p,
                primary: `Page: ${p}`,
                secondary: `${b.board} · POD ${pod.pod} · ${team.team}`,
              })
            }
          }
          // Chatter + per-chatter manager hits
          for (const c of team.chatters) {
            if (c.name.toLowerCase().includes(needle)) {
              matches.push({
                board: b.board, boardSlug, pod: pod.pod, team: team.team, chatter: c.name,
                primary: `Chatter: ${c.name}`,
                secondary: `${b.board} · POD ${pod.pod} · ${team.team} · ${team.pageNames.join(' / ') || '—'}${c.manager ? ` · mgr ${c.manager}` : ''}`,
              })
            }
            if (c.manager && c.manager.toLowerCase().includes(needle)) {
              matches.push({
                board: b.board, boardSlug, pod: pod.pod, team: team.team, chatter: c.name, manager: c.manager,
                primary: `Manager: ${c.manager} (via ${c.name})`,
                secondary: `${b.board} · POD ${pod.pod} · ${team.team}`,
              })
            }
          }
        }
      }
    }
    // Dedupe by (board, pod, team, page or chatter, primary)
    const seen = new Set<string>()
    const unique: Hit[] = []
    for (const h of matches) {
      const k = `${h.board}|${h.pod}|${h.team ?? ''}|${h.page ?? ''}|${h.chatter ?? ''}|${h.primary}`
      if (seen.has(k)) continue
      seen.add(k)
      unique.push(h)
    }
    return unique
  }, [q, boards])

  return (
    <div style={{ marginBottom: 18 }}>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search PODs, teams, pages, chatters, managers…"
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '9px 12px', borderRadius: 8,
          fontSize: 13, fontFamily: 'inherit', outline: 'none',
          width: '100%', maxWidth: 480,
        }}
      />
      {hits !== null && (
        <div style={{
          marginTop: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          maxWidth: 560,
          maxHeight: 360,
          overflowY: 'auto',
        }}>
          {hits.length === 0 ? (
            <div style={{ padding: '14px 14px', fontSize: 12.5, color: 'var(--text-4)', fontStyle: 'italic' }}>
              No matches.
            </div>
          ) : (
            hits.slice(0, 50).map((h, i) => (
              <Link
                key={i}
                href={`/boards/${h.boardSlug}`}
                style={{
                  display: 'block',
                  padding: '10px 14px',
                  borderBottom: i === Math.min(hits.length, 50) - 1 ? 'none' : '1px solid var(--border)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{h.primary}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'monospace' }}>{h.secondary}</div>
              </Link>
            ))
          )}
          {hits.length > 50 && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-4)', textAlign: 'center', fontStyle: 'italic' }}>
              +{hits.length - 50} more · narrow your query
            </div>
          )}
        </div>
      )}
    </div>
  )
}
