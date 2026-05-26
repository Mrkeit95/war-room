import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_RECURRENCE = /^(daily|weekdays|weekly:[0-6])$/

type Body = {
  text?: unknown
  done?: unknown
  due_date?: unknown
  recurrence?: unknown
  id?: unknown
}

function sanitize(body: Body) {
  const out: Record<string, unknown> = {}
  if (typeof body.text === 'string') {
    const t = body.text.trim()
    if (t.length === 0) throw new Error('text cannot be empty')
    if (t.length > 500) throw new Error('text too long')
    out.text = t
  }
  if (typeof body.done === 'boolean') out.done = body.done
  if (body.due_date === null || body.due_date === undefined) out.due_date = null
  else if (typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) out.due_date = body.due_date
  else if (typeof body.due_date === 'string' && body.due_date.length === 0) out.due_date = null
  if (body.recurrence === null || body.recurrence === undefined) out.recurrence = null
  else if (typeof body.recurrence === 'string' && body.recurrence.length === 0) out.recurrence = null
  else if (typeof body.recurrence === 'string' && VALID_RECURRENCE.test(body.recurrence)) out.recurrence = body.recurrence
  return out
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('reminders')
      .select('id, text, done, created_at, due_date, recurrence')
      .order('done', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return NextResponse.json({ reminders: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body
    const patch = sanitize(body)
    if (!patch.text) return NextResponse.json({ error: 'text required' }, { status: 400 })
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('reminders')
      .insert(patch)
      .select('id, text, done, created_at, due_date, recurrence')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ reminder: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Body
    const id = body.id
    if (typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch = sanitize(body)
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('reminders')
      .update(patch)
      .eq('id', id)
      .select('id, text, done, created_at, due_date, recurrence')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ reminder: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const supabase = createAdminClient()
    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
