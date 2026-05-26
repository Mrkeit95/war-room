'use server'

import { runSync } from '@/lib/sync'
import { revalidatePath } from 'next/cache'

export type SyncActionResult =
  | {
      ok: true
      modelsSynced: number
      candidatesSynced: number
      pageAssignmentsSynced: number
      boardGroupsSynced: number
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
      durationMs: result.durationMs,
      warnings: result.warnings,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
