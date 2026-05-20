/**
 * Maps Monday.com group titles to canonical stage names, plus UI bucket aliases.
 * Granular stages preserved in DB; UI uses the 7-bucket scheme inherited from the mockup.
 */

export type CanonicalStage =
  | 'typeform'
  | 'passed_typeform'
  | 'pending_interview'
  | 'scheduled_interview'
  | 'pending_onboarding'
  | 'pending_week_1'
  | 'week_1_training'
  | 'week_2_training'
  | 'week_3_training'
  | 'training_board'
  | 'pool'
  | 'standby'
  | 'active'
  | 'promoted'
  | 'pto'
  | 'offboarded'

export type UiBucket = 'typeform' | 'passed' | 'pending' | 'scheduled' | 'training' | 'standby' | 'active' | null

const STAGE_BY_GROUP: Record<string, CanonicalStage> = {
  // Typeform intake
  'TYPEFORM': 'typeform',
  'TYPEFORMS': 'typeform',
  'No Experience/Passed typeform': 'passed_typeform',
  'PASSED- TYPEFORMS': 'passed_typeform',
  'PASSED TYPEFORM': 'passed_typeform',

  // Interview pipeline
  'PENDING- INTERVIEWS': 'pending_interview',
  'PENDING INTERVIEWS': 'pending_interview',
  'SCHEDULED- INTERVIEWS': 'scheduled_interview',
  'SCHEDULED INTERVIEWS': 'scheduled_interview',
  'SCHEDULED INTERVIEWS (EXP)': 'scheduled_interview',
  'TRANSFERRED TO ALEKSANDAR (EXP)': 'offboarded',

  // Onboarding / pending-week-1
  'PENDING- DISCORD ONBOARDING': 'pending_onboarding',
  'PENDING - DISCORD ONBOARDING(EXP)': 'pending_onboarding',
  'PENDING WEEK 1': 'pending_week_1',

  // Training
  'WEEK 1- TRAINING': 'week_1_training',
  'WEEK 1- TRAINING (Non Exp)': 'week_1_training',
  'WEEK 1- TRAINING (EXP)': 'training_board',
  'WEEK 1 TRAINING': 'week_1_training',
  'WEEK 2- TRAINING': 'week_2_training',
  'WEEK 2 TRAINING SHADOW+LIVE CHATS': 'week_2_training',
  'WEEK 3-4 EXTRA CHATTING': 'week_3_training',

  // Training board (PH-specific exp track)
  'TRAINING BOARD CHATTERS': 'training_board',
  'TB PROBATION (EXP)': 'training_board',
  'PENDING TB PROBATION (EXP)': 'training_board',

  // Post-training / holding
  'POOL (AFTER WEEK 2)': 'pool',
  'STANDBY': 'standby',
  'STANDBY (EXP)': 'standby',
  'STANDBY (FROM TB)': 'standby',

  // Active / promoted / PTO
  'ACTIVE': 'active',
  'PROMOTED': 'promoted',
  'PERSONAL TIME OFF': 'pto',

  // Excluded
  'OFFBOARDED': 'offboarded',
  'BLACKLISTED': 'offboarded',
}

export function normalizeStage(groupTitle: string | null | undefined): CanonicalStage | null {
  if (!groupTitle) return null
  return STAGE_BY_GROUP[groupTitle] ?? null
}

export function uiBucket(stage: CanonicalStage | null | undefined): UiBucket {
  if (!stage) return null
  switch (stage) {
    case 'typeform': return 'typeform'
    case 'passed_typeform': return 'passed'
    case 'pending_interview': return 'pending'
    case 'scheduled_interview':
    case 'pending_onboarding': return 'scheduled'
    case 'pending_week_1':
    case 'week_1_training':
    case 'week_2_training':
    case 'week_3_training':
    case 'training_board': return 'training'
    case 'pool':
    case 'standby': return 'standby'
    case 'active':
    case 'promoted':
    case 'pto': return 'active'
    case 'offboarded': return null
  }
}

export function inPipeline(stage: CanonicalStage | null | undefined): boolean {
  return stage !== null && stage !== 'offboarded' && stage !== undefined
}

export function detectTrack(stage: CanonicalStage | null | undefined, groupTitle: string | null | undefined): 'exp' | 'non_exp' | null {
  if (!groupTitle) return null
  if (groupTitle.includes('(EXP)') || groupTitle.includes('(Exp)')) return 'exp'
  if (groupTitle.includes('Non Exp') || groupTitle.includes('Non-Exp')) return 'non_exp'
  // Training board groups are all EXP track
  if (stage === 'training_board') return 'exp'
  return null
}
