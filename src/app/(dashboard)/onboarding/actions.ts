'use server'

import { runSync } from '@/lib/sync'
import { revalidatePath } from 'next/cache'

export type SyncActionResult =
  | { ok: true; modelsSynced: number; candidatesSynced: number; durationMs: number }
  | { ok: false; error: string }

export async function triggerSync(): Promise<SyncActionResult> {
  try {
    const result = await runSync('manual')
    revalidatePath('/onboarding')
    return {
      ok: true,
      modelsSynced: result.modelsSynced,
      candidatesSynced: result.candidatesSynced,
      durationMs: result.durationMs,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
