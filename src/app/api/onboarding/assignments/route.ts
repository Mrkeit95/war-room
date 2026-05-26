import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { splitChatterNames } from '@/lib/boards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type AssignmentShift = {
  shiftName: string
  chatterName: string                // single chatter (rows fanned out if Monday combined them)
  groupTitle: string | null
  pod: string | null
  team: string | null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const model = url.searchParams.get('model')?.trim()
  if (!model) return NextResponse.json({ error: 'model query param required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('page_assignments')
    .select('shift_name, chatter_name, group_title, pod, team')
    .ilike('group_title', `%${model}%`)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const shifts: AssignmentShift[] = []
  for (const r of (data ?? []) as { shift_name: string; chatter_name: string | null; group_title: string | null; pod: string | null; team: string | null }[]) {
    const names = splitChatterNames(r.chatter_name)
    if (names.length === 0) {
      // Still emit one row so the operator sees an unfilled shift slot
      shifts.push({ shiftName: r.shift_name, chatterName: '', groupTitle: r.group_title, pod: r.pod, team: r.team })
    } else {
      for (const n of names) {
        shifts.push({ shiftName: r.shift_name, chatterName: n, groupTitle: r.group_title, pod: r.pod, team: r.team })
      }
    }
  }

  // Sort: Morning, Day, Night, Filler, then chatter alphabetically
  const order = ['MORNING', 'DAY', 'NIGHT', 'FILLER']
  shifts.sort((a, b) => {
    const ai = order.findIndex(o => a.shiftName?.toUpperCase().includes(o))
    const bi = order.findIndex(o => b.shiftName?.toUpperCase().includes(o))
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    if (a.shiftName !== b.shiftName) return a.shiftName.localeCompare(b.shiftName)
    return a.chatterName.localeCompare(b.chatterName)
  })

  return NextResponse.json({ model, shifts })
}
