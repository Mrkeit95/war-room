import type { Region } from './candidates'

export type RegionPhase = 'interview' | 'training' | null

// Anchor: Monday of the week where EU+SA = training, UK = interview.
// Parity flips every Monday. See memory/project_rotation.md.
const ANCHOR_WEEK_START = new Date('2026-05-18T00:00:00')
const MS_PER_DAY = 86_400_000

function startOfWeek(d: Date): Date {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diffToMonday)
  return result
}

function weeksSinceAnchor(date: Date): number {
  const current = startOfWeek(date)
  const days = Math.round((current.getTime() - ANCHOR_WEEK_START.getTime()) / MS_PER_DAY)
  return days / 7
}

export function getRegionPhase(region: Region, date: Date = new Date()): RegionPhase {
  if (region === 'PH') return null
  const weeks = weeksSinceAnchor(date)
  const parity = ((Math.trunc(weeks) % 2) + 2) % 2
  const onAnchorParity = parity === 0
  if (region === 'EU' || region === 'SA') {
    return onAnchorParity ? 'training' : 'interview'
  }
  // UK
  return onAnchorParity ? 'interview' : 'training'
}

export function phaseLabel(phase: RegionPhase): string {
  if (phase === 'interview') return 'Interview week'
  if (phase === 'training') return 'Training week'
  return ''
}

export function phaseColor(phase: RegionPhase): string {
  if (phase === 'interview') return 'var(--blue)'
  if (phase === 'training') return 'var(--violet)'
  return 'var(--text-3)'
}

export function phaseBg(phase: RegionPhase): string {
  if (phase === 'interview') return 'rgba(96,165,250,0.10)'
  if (phase === 'training') return 'rgba(167,139,250,0.10)'
  return 'transparent'
}
