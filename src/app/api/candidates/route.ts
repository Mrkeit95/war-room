import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCandidates } from '@/lib/db'
import type { UiBucket } from '@/lib/stages'
import type { Region } from '@/lib/candidates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REGIONS = new Set(['PH', 'EU', 'SA', 'UK'])
const BUCKETS = new Set(['typeform', 'passed', 'pending', 'scheduled', 'training', 'standby', 'active'])
const GRADES = new Set(['A', 'B', 'C', 'D', 'F'])

export async function GET(req: Request) {
  const url = new URL(req.url)
  const regionRaw = url.searchParams.get('region')?.toUpperCase()
  const bucketRaw = url.searchParams.get('bucket')?.toLowerCase()
  const gradeRaw = url.searchParams.get('grade')?.toUpperCase()
  const groupRaw = url.searchParams.get('group')
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 100, 500) : 100

  const region = regionRaw && REGIONS.has(regionRaw) ? (regionRaw as Region) : undefined
  const bucket = bucketRaw && BUCKETS.has(bucketRaw) ? (bucketRaw as UiBucket) : undefined
  const grade = gradeRaw && GRADES.has(gradeRaw) ? gradeRaw : undefined
  const group = groupRaw?.trim()

  try {
    if (group) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      let q = supabase
        .from('candidates')
        .select('id, monday_item_id, region, name, current_stage, current_group_title, current_status, tier, track, assigned_manager, telegram, phone, email, country, source, monday_created_at, monday_updated_at, first_seen_at, last_synced_at, current_stage_entered_at')
        .eq('current_group_title', group)
      if (region) q = q.eq('region', region)
      q = q.order('monday_updated_at', { ascending: false, nullsFirst: false }).limit(limit)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return NextResponse.json({ candidates: data ?? [] })
    }

    if (grade) {
      // Filter by tier (case-insensitive) instead of stage
      const supabase = createAdminClient()
      let q = supabase
        .from('candidates')
        .select('id, monday_item_id, region, name, current_stage, current_group_title, current_status, tier, track, assigned_manager, telegram, phone, email, country, source, monday_created_at, monday_updated_at, first_seen_at, last_synced_at')
        .ilike('tier', grade)
        .neq('current_stage', 'offboarded')
      if (region) q = q.eq('region', region)
      q = q.order('monday_updated_at', { ascending: false, nullsFirst: false }).limit(limit)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return NextResponse.json({ candidates: data ?? [] })
    }

    const candidates = await listCandidates({ region, bucket, limit })
    return NextResponse.json({ candidates })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

