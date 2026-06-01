'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { GRADE_CATEGORIES, weekStarting, type GradeCategoryKey, type GradeScores } from '@/lib/grading'

export type SaveGradeInput = {
  candidateId: string
  weekStarting?: string                // defaults to current week (Monday UTC)
  graderName: string
  graderRole?: string | null
  scores: GradeScores
  notes?: string | null
}

export type SaveGradeResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function saveChatterGrade(input: SaveGradeInput): Promise<SaveGradeResult> {
  try {
    const supabase = createAdminClient()
    if (!input.candidateId) return { ok: false, error: 'candidateId required' }
    if (!input.graderName?.trim()) return { ok: false, error: 'graderName required' }

    const week = input.weekStarting ?? weekStarting()

    // Build the row from the score fields plus metadata. Only include keys the
    // grader actually provided so we don't wipe other categories on partial saves.
    const row: Record<string, unknown> = {
      candidate_id: input.candidateId,
      week_starting: week,
      grader_name: input.graderName.trim(),
      grader_role: input.graderRole ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    }
    for (const c of GRADE_CATEGORIES) {
      const key = c.key as GradeCategoryKey
      if (key in input.scores) {
        const v = input.scores[key]
        row[key] = (typeof v === 'number' && v >= 1 && v <= 5) ? v : null
      }
    }

    const { data, error } = await supabase
      .from('chatter_grades')
      .upsert(row, { onConflict: 'candidate_id,week_starting,grader_name' })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }

    revalidatePath('/grading')
    return { ok: true, id: (data as { id: string }).id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
