import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BOARD_TO_AE,
  MANAGER_SHIFTS,
  OVERSEERS,
  PH_SECTION_MANAGERS,
  REGION_SOLE_OWNER,
  displayName,
  type ShiftConfig,
} from '@/lib/manager_sections'

export const dynamic = 'force-dynamic'

type Group = 'leadership' | 'region-heads' | 'aes' | 'recruiters' | 'trainers'

type Person = {
  key: string                   // unique id (display name if synthetic, raw Monday name if real)
  display: string
  rawName?: string              // Monday assigned_manager string (for filtering candidates)
  role: string
  groupTag: Group
  scope: string[]
  shift?: ShiftConfig
  candidateCount?: number
  candidatesHref?: string
}

const GROUP_LABELS: Record<Group, string> = {
  'leadership': 'Leadership',
  'region-heads': 'Region heads',
  'aes': 'Account Executives',
  'recruiters': 'Recruiters',
  'trainers': 'Trainers',
}

const RECRUITER_KEYS = new Set(['Pauline', 'Daireen Mae Dagatan', 'apple baez'])

async function fetchManagerCounts(): Promise<Map<string, number>> {
  const supabase = createAdminClient()
  const PAGE = 1000
  const counts = new Map<string, number>()
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('candidates')
      .select('assigned_manager')
      .neq('current_stage', 'offboarded')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    for (const row of data as { assigned_manager: string | null }[]) {
      const m = row.assigned_manager?.trim()
      if (!m) continue
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return counts
}

function buildPeople(counts: Map<string, number>): Person[] {
  const people: Person[] = []
  const sectionsBy = new Map<string, string[]>()
  for (const sec of PH_SECTION_MANAGERS) {
    for (const m of sec.managers) {
      const list = sectionsBy.get(m) ?? []
      list.push(sec.groupTitle)
      sectionsBy.set(m, list)
    }
  }

  // Leadership / overseers
  for (const o of OVERSEERS) {
    people.push({
      key: o.name,
      display: o.display,
      role: o.role,
      groupTag: 'leadership',
      scope: o.scope,
      shift: MANAGER_SHIFTS[o.name],
      candidateCount: counts.get(o.name),
    })
  }

  // Region heads
  for (const [region, rawName] of Object.entries(REGION_SOLE_OWNER)) {
    if (!rawName) continue
    people.push({
      key: `region-${region}`,
      display: displayName(rawName),
      rawName,
      role: `${region} head · runs the whole region`,
      groupTag: 'region-heads',
      scope: [`Every section on ${region} board`],
      shift: MANAGER_SHIFTS[rawName],
      candidateCount: counts.get(rawName),
      candidatesHref: `/candidates?manager=${encodeURIComponent(rawName)}`,
    })
  }

  // AEs (per BOARD)
  for (const [board, ae] of Object.entries(BOARD_TO_AE)) {
    people.push({
      key: `ae-${board}`,
      display: ae,
      role: `AE · ${board}`,
      groupTag: 'aes',
      scope: [board, 'Standby → page assignment'],
      shift: MANAGER_SHIFTS[ae],
      candidateCount: counts.get(ae),
      candidatesHref: `/candidates?board=${encodeURIComponent(board)}`,
    })
  }

  // PH Recruiters
  for (const rawName of Array.from(sectionsBy.keys())) {
    if (!RECRUITER_KEYS.has(rawName)) continue
    people.push({
      key: rawName,
      display: displayName(rawName),
      rawName,
      role: 'PH Recruiting',
      groupTag: 'recruiters',
      scope: sectionsBy.get(rawName) ?? [],
      shift: MANAGER_SHIFTS[rawName],
      candidateCount: counts.get(rawName),
      candidatesHref: `/candidates?manager=${encodeURIComponent(rawName)}`,
    })
  }

  // PH Trainers
  for (const rawName of Array.from(sectionsBy.keys())) {
    if (RECRUITER_KEYS.has(rawName)) continue
    people.push({
      key: rawName,
      display: displayName(rawName),
      rawName,
      role: 'PH Training',
      groupTag: 'trainers',
      scope: sectionsBy.get(rawName) ?? [],
      shift: MANAGER_SHIFTS[rawName],
      candidateCount: counts.get(rawName),
      candidatesHref: `/candidates?manager=${encodeURIComponent(rawName)}`,
    })
  }

  return people
}

export default async function ManagersPage({ searchParams }: { searchParams: Promise<{ group?: string; q?: string; focus?: string }> }) {
  const params = await searchParams
  const filterGroupRaw = params.group?.toLowerCase()
  const filterGroup: Group | null = (['leadership', 'region-heads', 'aes', 'recruiters', 'trainers'] as Group[]).includes(filterGroupRaw as Group)
    ? (filterGroupRaw as Group)
    : null
  const filterQuery = params.q?.trim().toLowerCase() ?? ''
  const focusKey = params.focus?.trim() || null

  let counts: Map<string, number>
  try {
    counts = await fetchManagerCounts()
  } catch (err) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Managers & shifts</h1>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, color: 'var(--red)', fontSize: 12.5 }}>
          Failed to load: {err instanceof Error ? err.message : String(err)}
        </div>
      </div>
    )
  }

  const allPeople = buildPeople(counts)

  // If focused on one person, render only their shift detail view
  if (focusKey) {
    const focused = allPeople.find(p => p.key === focusKey || p.rawName === focusKey || p.display === focusKey)
    if (focused) {
      return <FocusedShiftView person={focused} />
    }
  }

  const filtered = allPeople.filter(p => {
    if (filterGroup && p.groupTag !== filterGroup) return false
    if (filterQuery && !p.display.toLowerCase().includes(filterQuery) && !p.role.toLowerCase().includes(filterQuery)) return false
    return true
  })

  // Group filtered by groupTag, preserving order
  const grouped = new Map<Group, Person[]>()
  for (const p of filtered) {
    const arr = grouped.get(p.groupTag) ?? []
    arr.push(p)
    grouped.set(p.groupTag, arr)
  }

  const buildFilterHref = (override: { group?: Group | null; q?: string }) => {
    const next = new URLSearchParams()
    const g = override.group !== undefined ? override.group : filterGroup
    const q = override.q !== undefined ? override.q : filterQuery
    if (g) next.set('group', g)
    if (q) next.set('q', q)
    const qs = next.toString()
    return qs ? `/managers?${qs}` : '/managers'
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Managers & shifts</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          {filtered.length} {filtered.length === 1 ? 'person' : 'people'} across the org · all times in PHT
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FilterChips
          label="Role"
          current={filterGroup}
          options={[
            { label: `All · ${allPeople.length}`, value: null },
            { label: `Leadership · ${allPeople.filter(p => p.groupTag === 'leadership').length}`, value: 'leadership' },
            { label: `Region heads · ${allPeople.filter(p => p.groupTag === 'region-heads').length}`, value: 'region-heads' },
            { label: `AEs · ${allPeople.filter(p => p.groupTag === 'aes').length}`, value: 'aes' },
            { label: `Recruiters · ${allPeople.filter(p => p.groupTag === 'recruiters').length}`, value: 'recruiters' },
            { label: `Trainers · ${allPeople.filter(p => p.groupTag === 'trainers').length}`, value: 'trainers' },
          ]}
          hrefFor={(v) => buildFilterHref({ group: v })}
        />
        <form action="/managers" method="GET" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filterGroup && <input type="hidden" name="group" value={filterGroup} />}
          <input
            type="text"
            name="q"
            defaultValue={filterQuery}
            placeholder="Search name or role…"
            style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '7px 10px', borderRadius: 6,
              fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
            }}
          />
          {filterQuery && (
            <Link href={buildFilterHref({ q: '' })} style={{ fontSize: 11.5, color: 'var(--text-3)', textDecoration: 'none' }}>Clear ×</Link>
          )}
        </form>
      </div>

      {/* Grouped results */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No matches</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Try clearing the filter or search query.</div>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([groupKey, people]) => (
          <Panel key={groupKey} title={`${GROUP_LABELS[groupKey]} · ${people.length}`} style={{ marginBottom: 14 }}>
            <HeaderRow />
            {people.map((p, i) => (
              <PersonRow key={p.key} person={p} isLast={i === people.length - 1} />
            ))}
          </Panel>
        ))
      )}
    </div>
  )
}

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', ...style }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  )
}

const ROW_COLS = 'minmax(0, 1.3fr) minmax(0, 1.2fr) minmax(0, 1.5fr) minmax(0, 1.4fr) auto'

function HeaderRow() {
  const cell = (label: string, align: 'left' | 'right' = 'left') => (
    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500, textAlign: align }}>{label}</span>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 14, padding: '0 0 10px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      {cell('Name')}
      {cell('Role')}
      {cell('Scope')}
      {cell('Shift (PHT)')}
      {cell('Candidates', 'right')}
    </div>
  )
}

function PersonRow({ person, isLast }: { person: Person; isLast: boolean }) {
  const candidateCell = person.candidateCount !== undefined && person.candidateCount > 0 ? (
    person.candidatesHref ? (
      <Link href={person.candidatesHref} style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-2)', textDecoration: 'none', borderBottom: '1px dotted var(--border-strong)' }}>
        {person.candidateCount.toLocaleString()} →
      </Link>
    ) : (
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{person.candidateCount.toLocaleString()}</span>
    )
  ) : (
    <span style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'right' }}>—</span>
  )
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: ROW_COLS, gap: 14,
      alignItems: 'center', padding: '13px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <Link
        href={`/managers?focus=${encodeURIComponent(person.key)}`}
        style={{
          fontSize: 13.5, fontWeight: 500, color: 'var(--text)', textDecoration: 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
        }}
        title="Click to see this person's shift"
      >
        {person.display}
      </Link>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{person.role}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {person.scope.slice(0, 3).map(s => (
          <span key={s} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'var(--surface-3)', color: 'var(--text-2)' }}>{s}</span>
        ))}
        {person.scope.length > 3 && (
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, color: 'var(--text-4)' }}>+{person.scope.length - 3}</span>
        )}
      </div>
      <ShiftCell shift={person.shift} />
      {candidateCell}
    </div>
  )
}

function FocusedShiftView({ person }: { person: Person }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/managers" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>← All managers</Link>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10, marginBottom: 6 }}>{person.display}</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{person.role}</div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 18 }}>Shift schedule · PHT</div>
        {!person.shift ? (
          <div style={{ fontSize: 13, color: 'var(--text-4)', fontStyle: 'italic' }}>
            No shift configured yet for {person.display}.
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>{person.shift.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'center' }}>
              {person.shift.blocks.map((b, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{b.day}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--text)' }}>
                    {b.start} → {b.end} PHT
                    {b.crossesMidnight && <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--text-4)' }}>(overnight)</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {person.scope.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 12 }}>Scope</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {person.scope.map(s => (
              <span key={s} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {person.candidatesHref && person.candidateCount !== undefined && person.candidateCount > 0 && (
        <Link
          href={person.candidatesHref}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 16px',
            fontSize: 13, color: 'var(--text-2)', textDecoration: 'none',
          }}
        >
          View {person.candidateCount.toLocaleString()} candidates →
        </Link>
      )}
    </div>
  )
}

function ShiftCell({ shift }: { shift?: ShiftConfig }) {
  if (!shift) {
    return <span style={{ fontSize: 11.5, color: 'var(--text-4)', fontStyle: 'italic' }}>not configured</span>
  }
  // For trainers with many blocks: compact summary; for simple ones: show all
  const summary = shift.blocks.length === 1
    ? `${shift.blocks[0].day} · ${shift.blocks[0].start}–${shift.blocks[0].end}`
    : `${shift.blocks.length} blocks/week`
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 2 }}>{shift.label}</div>
      {shift.blocks.length === 1 ? (
        <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace' }}>{summary}</div>
      ) : (
        <details style={{ fontSize: 12, color: 'var(--text)' }}>
          <summary style={{ cursor: 'pointer', listStyle: 'none', color: 'var(--text-2)', fontFamily: 'monospace', fontSize: 11.5 }}>
            {summary} ↓
          </summary>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {shift.blocks.map((b, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)' }}>
                {b.day} {b.start}–{b.end}{b.crossesMidnight ? ' (overnight)' : ''}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function FilterChips({ label, options, current, hrefFor }: {
  label: string
  options: { label: string; value: Group | null }[]
  current: Group | null
  hrefFor: (value: Group | null) => string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500, minWidth: 56 }}>{label}</span>
      {options.map(o => {
        const active = current === o.value
        return (
          <Link
            key={o.label}
            href={hrefFor(o.value)}
            style={{
              fontSize: 11.5, padding: '4px 10px', borderRadius: 5, textDecoration: 'none', fontWeight: 500,
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-3)',
              border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
            }}
          >{o.label}</Link>
        )
      })}
    </div>
  )
}
