import { NextResponse } from 'next/server'
import { getChatterGrades, GRADE_CATEGORIES, weekStarting, composite, type GradeRow } from '@/lib/grading'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params
  if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 })

  try {
    const rows = await getChatterGrades(candidateId)
    const thisWeek = weekStarting()

    // Group by week to compute composites for the last 4 weeks
    const byWeek = new Map<string, GradeRow[]>()
    for (const r of rows) {
      const arr = byWeek.get(r.weekStarting) ?? []
      arr.push(r)
      byWeek.set(r.weekStarting, arr)
    }

    const weeklyComposites: { week: string; composite: number | null; graders: number }[] = []
    for (const [week, weekRows] of [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      const comps = weekRows.map(r => composite(r.scores)).filter((c): c is number => c !== null)
      const avg = comps.length > 0 ? comps.reduce((s, v) => s + v, 0) / comps.length : null
      weeklyComposites.push({ week, composite: avg, graders: weekRows.length })
    }

    return NextResponse.json({
      candidateId,
      thisWeek,
      thisWeekGrades: rows.filter(r => r.weekStarting === thisWeek),
      historyComposites: weeklyComposites.slice(0, 4),
      categories: GRADE_CATEGORIES,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
