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

/** Regions where one person runs every section end-to-end. */
export const REGION_SOLE_OWNER: Partial<Record<Region, string>> = {
  EU: 'Aleksandar Simic',
  SA: 'JUAN SEBASTIAN GONZALEZ PEREZ',
  UK: 'noah whall',
}

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
}

export function aeForBoard(boardAssignment: string | null | undefined): string | null {
  if (!boardAssignment) return null
  return BOARD_TO_AE[boardAssignment.trim().toUpperCase()] ?? null
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
