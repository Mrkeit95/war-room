/**
 * Configured people who can grade chatters. Used as the dropdown source on
 * the grading UI. Names here must match what shows up in candidate
 * `assigned_manager` for the scoping/filtering to work later.
 */

export type GraderEntry = {
  name: string                          // canonical key (matches Monday's assigned_manager)
  displayName: string                   // pretty label for the dropdown
  role: string
  group: string                         // optgroup label
}

export const GRADER_ROSTER: GraderEntry[] = [
  // Hiring / Week 0 recruiters
  { name: 'Pauline', displayName: 'Pauline', role: 'PH Recruiting', group: 'PH · Recruiting' },
  { name: 'Daireen Mae Dagatan', displayName: 'Daireen Mae Dagatan', role: 'PH Recruiting', group: 'PH · Recruiting' },
  { name: 'apple baez', displayName: 'Apple Baez', role: 'PH Recruiting', group: 'PH · Recruiting' },

  // Week 1
  { name: 'Andrei Angelo Cando', displayName: 'Andrei Angelo Cando', role: 'PH · Week 1', group: 'PH · Section leads' },
  { name: 'Jose Manuel Galan', displayName: 'Jose Manuel Galan', role: 'PH · Week 1', group: 'PH · Section leads' },

  // Week 2 / 3-4 / TB
  { name: 'Arjay Labado', displayName: 'Arjay Labado', role: 'PH · Week 2 / TB', group: 'PH · Section leads' },
  { name: 'Pamela Amuro Miña', displayName: 'Pamela Amuro Miña', role: 'PH · Week 2 / TB', group: 'PH · Section leads' },
  { name: 'Prince Ellesor Torres', displayName: 'Prince Ellesor Torres', role: 'PH · Week 3-4 / TB', group: 'PH · Section leads' },
  { name: 'Gwyneth Fuentes', displayName: 'Gwyneth Fuentes', role: 'PH · Week 3-4 / TB', group: 'PH · Section leads' },

  // Training head
  { name: 'Allyson Sam', displayName: 'Allyson Sam', role: 'Head of Training', group: 'Training' },

  // AEs (board owners)
  { name: 'Day Quintero', displayName: 'Day Quintero', role: 'AE · BOARD 1', group: 'AEs' },
  { name: 'Angie Toro', displayName: 'Angie Toro', role: 'AE · BOARD 2', group: 'AEs' },
  { name: 'Iori Vukotic', displayName: 'Iori Vukotic', role: 'AE · BOARD 3', group: 'AEs' },

  // Regional heads (sole owners of EU/SA)
  { name: 'Aleksandar Simic', displayName: 'Aleksandar Simic', role: 'EU Head', group: 'Regional heads' },
  { name: 'JUAN SEBASTIAN GONZALEZ PEREZ', displayName: 'Juan Sebastian Gonzalez Perez', role: 'SA Head', group: 'Regional heads' },

  // Owner
  { name: 'Keit', displayName: 'Keit (Owner)', role: 'Owner', group: 'Owner' },
]
