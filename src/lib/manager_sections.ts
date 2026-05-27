/**
 * Section-by-section manager assignments per region.
 * Source of truth captured in memory/project_org_structure.md.
 *
 * Manager names below are the EXACT strings stored in Monday's
 * assigned_manager column — used for direct string matching.
 * Use displayName() for nicer rendering.
 */

import type { Region } from './candidates'

export type SectionAssignment = {
  groupTitle: string         // Monday group title (exact)
  managers: string[]         // Monday assigned_manager strings
  shift?: string             // free-text shift label, e.g. "8am–4pm PHT"
}

/** PH section-level managers, by Monday group title. */
export const PH_SECTION_MANAGERS: SectionAssignment[] = [
  { groupTitle: 'TYPEFORM', managers: ['Pauline', 'Daireen Mae Dagatan', 'apple baez'] },
  { groupTitle: 'PENDING - DISCORD ONBOARDING(EXP)', managers: ['Pauline', 'Daireen Mae Dagatan', 'apple baez'] },
  { groupTitle: 'SCHEDULED INTERVIEWS (EXP)', managers: ['Pauline', 'Daireen Mae Dagatan', 'apple baez'] },
  { groupTitle: 'TRANSFERRED TO ALEKSANDAR (EXP)', managers: ['Pauline', 'Daireen Mae Dagatan', 'apple baez'] },
  { groupTitle: 'PENDING WEEK 1', managers: ['Andrei Angelo Cando', 'Jose Manuel Galan'], shift: '8am–4pm PHT' },
  { groupTitle: 'WEEK 1 TRAINING', managers: ['Andrei Angelo Cando', 'Jose Manuel Galan'], shift: '8am–4pm PHT' },
  { groupTitle: 'WEEK 2 TRAINING SHADOW+LIVE CHATS', managers: ['Arjay Labado', 'Pamela Amuro Miña'], shift: 'rotating EST shifts' },
  { groupTitle: 'WEEK 3-4 EXTRA CHATTING', managers: ['Prince Ellesor Torres', 'Gwyneth Fuentes'], shift: 'rotating EST shifts' },
  { groupTitle: 'TRAINING BOARD CHATTERS', managers: ['Arjay Labado', 'Pamela Amuro Miña', 'Prince Ellesor Torres', 'Gwyneth Fuentes'], shift: 'rotating EST shifts' },
  { groupTitle: 'TB PROBATION (EXP)', managers: ['Prince Ellesor Torres', 'Gwyneth Fuentes'], shift: 'rotating EST shifts' },
  { groupTitle: 'PENDING TB PROBATION (EXP)', managers: ['Prince Ellesor Torres', 'Gwyneth Fuentes'], shift: 'rotating EST shifts' },
  { groupTitle: 'POOL (AFTER WEEK 2)', managers: ['Prince Ellesor Torres', 'Gwyneth Fuentes', 'Arjay Labado', 'Pamela Amuro Miña'], shift: 'rotating EST shifts' },
]

/** Canonical Monday board group order (top→bottom on Monday). Drives Stage Detail rendering. */
export const GROUP_ORDER: Record<Region, string[]> = {
  PH: [
    'TYPEFORM',
    'TRANSFERRED TO ALEKSANDAR (EXP)',
    'SCHEDULED INTERVIEWS (EXP)',
    'PENDING - DISCORD ONBOARDING(EXP)',
    'PENDING TB PROBATION (EXP)',
    'TB PROBATION (EXP)',
    'STANDBY (EXP)',
    'PENDING WEEK 1',
    'WEEK 1 TRAINING',
    'WEEK 2 TRAINING SHADOW+LIVE CHATS',
    'WEEK 3-4 EXTRA CHATTING',
    'POOL (AFTER WEEK 2)',
    'TRAINING BOARD CHATTERS',
    'STANDBY (FROM TB)',
    'ACTIVE',
    'PERSONAL TIME OFF',
    'PROMOTED',
    'OFFBOARDED',
    'BLACKLISTED',
  ],
  EU: [
    'No Experience/Passed typeform',
    'TYPEFORMS',
    'PASSED- TYPEFORMS',
    'PENDING INTERVIEWS',
    'SCHEDULED INTERVIEWS',
    'PENDING- DISCORD ONBOARDING',
    'WEEK 1- TRAINING (Non Exp)',
    'WEEK 1- TRAINING (EXP)',
    'STANDBY',
    'OFFBOARDED',
  ],
  SA: [
    'TYPEFORMS',
    'PASSED TYPEFORM',
    'SCHEDULED INTERVIEWS',
    'WEEK 1- TRAINING',
    'WEEK 2- TRAINING',
    'PENDING- DISCORD ONBOARDING',
    'STANDBY',
    'OFFBOARDED',
  ],
  UK: [
    'TYPEFORM',
    'PASSED- TYPEFORMS',
    'PENDING- INTERVIEWS',
    'SCHEDULED- INTERVIEWS',
    'WEEK 1- TRAINING',
    'WEEK 2- TRAINING',
    'STANDBY',
    'OFFBOARDED',
  ],
}

export function groupOrderIndex(region: Region, groupTitle: string | null | undefined): number {
  if (!groupTitle) return Number.MAX_SAFE_INTEGER
  const idx = GROUP_ORDER[region]?.indexOf(groupTitle)
  return idx === -1 || idx === undefined ? Number.MAX_SAFE_INTEGER : idx
}

/** Regions where one person runs every section end-to-end. */
export const REGION_SOLE_OWNER: Partial<Record<Region, string>> = {
  EU: 'Aleksandar Simic',
  SA: 'JUAN SEBASTIAN GONZALEZ PEREZ',
  UK: 'noah whall',
}

/** Shift schedules across the team (PHT). PH trainer shifts converted from EDT +12h. */
export type ShiftBlock = { day: string; start: string; end: string; crossesMidnight?: boolean }
export type ShiftConfig = { label: string; blocks: ShiftBlock[] }

export const MANAGER_SHIFTS: Record<string, ShiftConfig> = {
  'Gwyneth Fuentes': {
    label: 'Morning shift',
    blocks: [
      { day: 'Mon', start: '3pm', end: '11pm' },
      { day: 'Tue', start: '3pm', end: '11pm' },
      { day: 'Fri', start: '7pm', end: 'Sat 7am', crossesMidnight: true },
      { day: 'Sat', start: '7pm', end: 'Sun 7am', crossesMidnight: true },
      { day: 'Sun', start: '3pm', end: '11pm' },
    ],
  },
  'Prince Ellesor Torres': {
    label: 'Day shift',
    blocks: [
      { day: 'Mon', start: '11pm', end: 'Tue 7am', crossesMidnight: true },
      { day: 'Tue', start: '11pm', end: 'Wed 7am', crossesMidnight: true },
      { day: 'Wed', start: '7pm', end: 'Thu 7am', crossesMidnight: true },
      { day: 'Thu', start: '7pm', end: 'Fri 7am', crossesMidnight: true },
      { day: 'Sun', start: '11pm', end: 'Mon 7am', crossesMidnight: true },
    ],
  },
  'Pamela Amuro Miña': {
    label: 'Night shift',
    blocks: [
      { day: 'Tue', start: '7am', end: '3pm' },
      { day: 'Wed', start: '7am', end: '7pm' },
      { day: 'Sat', start: '7am', end: '7pm' },
      { day: 'Sun', start: '7am', end: '3pm' },
      { day: 'Mon', start: '7am', end: '3pm' },
    ],
  },
  'Arjay Labado': {
    label: 'Filler shift',
    blocks: [
      { day: 'Tue', start: '7am', end: '7pm' },
      { day: 'Wed', start: '7am', end: '7pm' },
      { day: 'Sat', start: '7am', end: '7pm' },
      { day: 'Sun', start: '7am', end: '7pm' },
      { day: 'Mon', start: '7am', end: '7pm' },
    ],
  },
  'Andrei Angelo Cando': {
    label: 'Week 1 lead (Day)',
    blocks: [
      { day: 'Mon–Fri', start: '8am', end: '4pm' },
    ],
  },
  'Jose Manuel Galan': {
    label: 'Week 1 lead (Day)',
    blocks: [
      { day: 'Mon–Fri', start: '8am', end: '4pm' },
    ],
  },
  // PH Recruiters
  'Pauline': {
    label: 'Recruiting · Day',
    blocks: [{ day: 'Mon–Fri', start: '11am', end: '7pm' }],
  },
  'Daireen Mae Dagatan': {
    label: 'Recruiting · Day',
    blocks: [{ day: 'Mon–Fri', start: '11am', end: '7pm' }],
  },
  'apple baez': {
    label: 'Recruiting · Morning',
    blocks: [{ day: 'Mon–Fri', start: '8am', end: '4pm' }],
  },
  // Regional heads
  'JUAN SEBASTIAN GONZALEZ PEREZ': {
    label: 'SA head',
    blocks: [{ day: 'Mon–Fri', start: '8am', end: '4pm' }],
  },
  'noah whall': {
    label: 'UK head',
    blocks: [{ day: 'Mon–Fri', start: '1pm', end: '9pm' }],
  },
  'Aleksandar Simic': {
    label: 'EU head',
    blocks: [
      { day: 'Mon', start: '6pm', end: '2am' },
      { day: 'Tue', start: '6pm', end: '2am' },
      { day: 'Wed', start: '6pm', end: '2am' },
      { day: 'Thu', start: '4pm', end: '12pm' },
      { day: 'Fri', start: '4pm', end: '12pm' },
    ],
  },
}

/** Back-compat alias for callers that expect the old name. */
export const PH_TRAINER_SHIFTS = MANAGER_SHIFTS

/** Pretty-name overrides for Monday strings that are lowercase / all-caps. */
export const MANAGER_DISPLAY_NAMES: Record<string, string> = {
  'apple baez': 'Apple Baez',
  'noah whall': 'Noah Whall',
  'JUAN SEBASTIAN GONZALEZ PEREZ': 'Juan Sebastian Gonzalez Perez',
}

export function displayName(monManager: string): string {
  return MANAGER_DISPLAY_NAMES[monManager] ?? monManager
}

/** Overseers — config-only roles not assigned to individual candidates in Monday. */
export type Overseer = {
  name: string                 // Monday-style key (for matching if they ever appear)
  display: string              // pretty name
  role: string
  scope: string[]              // human-readable scope tags, e.g. 'PH: Training pipeline'
}

export const OVERSEERS: Overseer[] = [
  {
    name: 'Allyson Sam',
    display: 'Allyson Sam',
    role: 'Head of Training',
    scope: ['PH: Week 1–4', 'PH: Training Board', 'PH: Pool', 'BOARD: TRAINING BOARD'],
  },
  { name: 'Day Quintero', display: 'Day Quintero', role: 'Account Executive', scope: ['BOARD 1'] },
  { name: 'Angie Toro', display: 'Angie Toro', role: 'Account Executive', scope: ['BOARD 2'] },
  { name: 'Iori Vukotic', display: 'Iori Vukotic', role: 'Account Executive', scope: ['BOARD 3'] },
  { name: 'Keit', display: 'Keit', role: 'Owner — overall + standby SLA', scope: ['ALL'] },
]

/** BOARD status → AE name (used to route standby SLA alerts). */
export const BOARD_TO_AE: Record<string, string> = {
  'BOARD 1': 'Day Quintero',
  'BOARD 2': 'Angie Toro',
  'BOARD 3': 'Iori Vukotic',
  'TRAINING BOARD': 'Allyson Sam',
  // TOWER is its own thing on the revenue tracker — no AE assigned yet
}

export function aeForBoard(boardAssignment: string | null | undefined): string | null {
  if (!boardAssignment) return null
  return BOARD_TO_AE[boardAssignment.trim().toUpperCase()] ?? null
}

/** People we've explicitly configured for each region (section managers + relevant overseers). */
export function getConfiguredManagerCount(region: Region): number {
  if (region === 'PH') {
    // 9 section managers + Allyson (head of training) + 3 AEs = 13
    return getAllSectionManagerNames('PH').size + 1 + 3
  }
  if (REGION_SOLE_OWNER[region]) return 1 // just the regional head
  return 0
}

/** Section assignments for a given region. */
export function getSectionsForRegion(region: Region): SectionAssignment[] {
  if (REGION_SOLE_OWNER[region]) {
    // Single-owner regions: not enumerated by group — the owner runs everything.
    return []
  }
  if (region === 'PH') return PH_SECTION_MANAGERS
  return []
}

/** Get the managers for a specific Monday group within a region. */
export function getSectionManagers(region: Region, groupTitle: string | null | undefined): { managers: string[]; shift?: string } {
  if (REGION_SOLE_OWNER[region]) {
    return { managers: [REGION_SOLE_OWNER[region]!] }
  }
  if (!groupTitle) return { managers: [] }
  const match = getSectionsForRegion(region).find(s => s.groupTitle === groupTitle)
  return match ? { managers: match.managers, shift: match.shift } : { managers: [] }
}

/** Every section-manager name configured for a region (used to decide main-board vs section). */
export function getAllSectionManagerNames(region: Region): Set<string> {
  const set = new Set<string>()
  if (REGION_SOLE_OWNER[region]) set.add(REGION_SOLE_OWNER[region]!)
  for (const s of getSectionsForRegion(region)) {
    for (const m of s.managers) set.add(m)
  }
  return set
}

/**
 * A manager is a "main board manager" if they appear in Monday's assigned_manager
 * for a region but aren't listed as a section manager. They cover the floor across
 * all sections rather than running one.
 */
export function isMainBoardManager(region: Region, managerName: string): boolean {
  return !getAllSectionManagerNames(region).has(managerName)
}
