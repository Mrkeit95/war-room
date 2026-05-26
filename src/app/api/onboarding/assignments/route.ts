import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type AssignmentShift = {
  shiftName: string
  chatterName: string | null
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

  const shifts: AssignmentShift[] = (data ?? []).map(r => {
    const row = r as { shift_name: string; chatter_name: string | null; group_title: string | null; pod: string | null; team: string | null }
    return {
      shiftName: row.shift_name,
      chatterName: row.chatter_name,
      groupTitle: row.group_title,
      pod: row.pod,
      team: row.team,
    }
  })

  // Sort: Morning, Day, Night, Filler, then anything else alphabetically
  const order = ['MORNING', 'DAY', 'NIGHT', 'FILLER']
  shifts.sort((a, b) => {
    const ai = order.findIndex(o => a.shiftName?.toUpperCase().includes(o))
    const bi = order.findIndex(o => b.shiftName?.toUpperCase().includes(o))
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return a.shiftName.localeCompare(b.shiftName)
  })

  return NextResponse.json({ model, shifts })
}
