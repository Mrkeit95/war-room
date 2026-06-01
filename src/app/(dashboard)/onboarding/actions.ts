'use server'

import { runSync } from '@/lib/sync'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { findColumnId, setStatusColumnValue } from '@/lib/monday'

export type SyncActionResult =
  | {
      ok: true
      modelsSynced: number
      candidatesSynced: number
      pageAssignmentsSynced: number
      boardGroupsSynced: number
      chatterGradesSynced: number
      gradesWrittenBack: number
      durationMs: number
      warnings: string[]
    }
  | { ok: false; error: string }

export async function triggerSync(): Promise<SyncActionResult> {
  try {
    const result = await runSync('manual')
    revalidatePath('/onboarding')
    revalidatePath('/boards')
    return {
      ok: true,
      modelsSynced: result.modelsSynced,
      candidatesSynced: result.candidatesSynced,
      pageAssignmentsSynced: result.pageAssignmentsSynced,
      boardGroupsSynced: result.boardGroupsSynced,
      chatterGradesSynced: result.chatterGradesSynced,
      gradesWrittenBack: result.gradesWrittenBack,
      durationMs: result.durationMs,
      warnings: result.warnings,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type MarkActiveResult = { ok: true; modelName: string } | { ok: false; error: string }

/**
 * Flip a model's STATUS column on Monday to "ACTIVE" and reflect it locally.
 * Used when a page starts earlier than its scheduled start date.
 */
export async function markModelActive(modelId: string): Promise<MarkActiveResult> {
  try {
    if (!modelId) return { ok: false, error: 'modelId required' }
    const supabase = createAdminClient()

    const { data: model, error: getErr } = await supabase
      .from('models')
      .select('monday_item_id, monday_board_id, name, status')
      .eq('id', modelId)
      .single()
    if (getErr) return { ok: false, error: `Lookup failed: ${getErr.message}` }
    if (!model) return { ok: false, error: 'Model not found' }
    if (!model.monday_item_id || !model.monday_board_id) {
      return { ok: false, error: 'Missing Monday IDs on this model' }
    }
    if (model.status === 'ACTIVE') {
      return { ok: true, modelName: model.name }
    }

    const columnId = await findColumnId(model.monday_board_id, 'STATUS (AE)', 'STATUS', 'Status')
    if (!columnId) return { ok: false, error: 'Status column not found on the model board' }

    await setStatusColumnValue(model.monday_board_id, model.monday_item_id, columnId, 'ACTIVE')

    // Update our local copy so the dashboard reflects the change before the next cron sync.
    await supabase
      .from('models')
      .update({ status: 'ACTIVE', last_synced_at: new Date().toISOString() })
      .eq('id', modelId)

    revalidatePath('/onboarding')
    return { ok: true, modelName: model.name }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
