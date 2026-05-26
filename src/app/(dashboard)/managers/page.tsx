import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BOARD_TO_AE,
  OVERSEERS,
  PH_SECTION_MANAGERS,
  PH_TRAINER_SHIFTS,
  REGION_SOLE_OWNER,
  displayName,
  type ShiftBlock,
} from '@/lib/manager_sections'

export const dynamic = 'force-dynamic'

type ManagerLoad = { name: string; count: number }

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

export default async function ManagersPage() {
  let counts: Map<string, number>
  try {
    counts = await fetchManagerCounts()
  } catch (err) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Managers</h1>
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 24, color: 'var(--red)', fontSize: 12.5 }}>
          Failed to load: {err instanceof Error ? err.message : String(err)}
        </div>
      </div>
    )
  }

  const sectionsBy = new Map<string, string[]>()
  for (const sec of PH_SECTION_MANAGERS) {
    for (const m of sec.managers) {
      const list = sectionsBy.get(m) ?? []
      list.push(sec.groupTitle)
      sectionsBy.set(m, list)
    }
  }

  // Collect PH operators (trainers + recruiters) — anyone in PH_SECTION_MANAGERS
  const phOperators = Array.from(sectionsBy.keys())

  // Recruiters = run TYPEFORM / SCHEDULED / etc (the early stages)
  const recruiterKeys = new Set(['Pauline', 'Daireen Mae Dagatan', 'apple baez'])
  const phRecruiters = phOperators.filter(n => recruiterKeys.has(n))
  const phTrainers = phOperators.filter(n => !recruiterKeys.has(n))

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Managers</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Shift schedule + section ownership across the org</div>
      </div>

      {/* Overseers */}
      <Panel title="Leadership · cross-region oversight" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {OVERSEERS.map((o, i) => (
            <ManagerRow key={o.name} name={o.display} role={o.role} scope={o.scope} candidateCount={counts.get(o.name)} isLast={i === OVERSEERS.length - 1} />
          ))}
        </div>
      </Panel>

      {/* Region heads */}
      <Panel title="Region heads · sole owners of EU / SA / UK" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Object.entries(REGION_SOLE_OWNER).map(([region, name], i, arr) => (
            <ManagerRow
              key={region}
              name={displayName(name!)}
              role={`${region} · everything end-to-end`}
              scope={[`Runs all sections on ${region} board`]}
              candidateCount={counts.get(name!)}
              isLast={i === arr.length - 1}
              candidatesHref={`/candidates?manager=${encodeURIComponent(name!)}`}
            />
          ))}
        </div>
      </Panel>

      {/* AEs */}
      <Panel title="Account Executives · BOARD ownership" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Object.entries(BOARD_TO_AE).map(([board, ae], i, arr) => (
            <ManagerRow
              key={board}
              name={ae}
              role={`AE — ${board}`}
              scope={[board, 'Assigns chatters from standby → pages']}
              candidateCount={counts.get(ae)}
              isLast={i === arr.length - 1}
              candidatesHref={`/candidates?board=${encodeURIComponent(board)}`}
            />
          ))}
        </div>
      </Panel>

      {/* PH Recruiters */}
      <Panel title="PH Recruiters · top-of-funnel" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {phRecruiters.map((rawName, i) => (
            <ManagerRow
              key={rawName}
              name={displayName(rawName)}
              role="Recruiting"
              scope={sectionsBy.get(rawName) ?? []}
              candidateCount={counts.get(rawName)}
              isLast={i === phRecruiters.length - 1}
              candidatesHref={`/candidates?manager=${encodeURIComponent(rawName)}`}
            />
          ))}
        </div>
      </Panel>

      {/* PH Trainers with shifts */}
      <Panel title="PH Trainers · shift schedule" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginBottom: 14 }}>All times in PHT (Asia/Manila)</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {phTrainers.map((rawName, i) => (
            <TrainerRow
              key={rawName}
              name={displayName(rawName)}
              rawName={rawName}
              shift={PH_TRAINER_SHIFTS[rawName]}
              sections={sectionsBy.get(rawName) ?? []}
              candidateCount={counts.get(rawName)}
              isLast={i === phTrainers.length - 1}
            />
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', ...style }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-3)', fontWeight: 500, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}

function ManagerRow({
  name, role, scope, candidateCount, isLast, candidatesHref,
}: { name: string; role: string; scope: string[]; candidateCount?: number; isLast: boolean; candidatesHref?: string }) {
  const content = (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 2fr) auto',
      alignItems: 'center', gap: 14,
      padding: '14px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      cursor: candidatesHref ? 'pointer' : 'default',
    }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{name}</span>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{role}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {scope.map(s => (
          <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--surface-3)', color: 'var(--text-2)' }}>{s}</span>
        ))}
      </div>
      {candidateCount !== undefined && candidateCount > 0 ? (
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{candidateCount.toLocaleString()} candidates</span>
      ) : <span style={{ fontSize: 11, color: 'var(--text-4)' }}>—</span>}
    </div>
  )
  return candidatesHref
    ? <Link href={candidatesHref} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{content}</Link>
    : content
}

function TrainerRow({
  name, rawName, shift, sections, candidateCount, isLast,
}: { name: string; rawName: string; shift?: { label: string; blocks: ShiftBlock[] }; sections: string[]; candidateCount?: number; isLast: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2.5fr) auto',
      alignItems: 'start', gap: 16,
      padding: '14px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{name}</div>
        {shift && (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{shift.label}</div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6 }}>Sections:</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {sections.map(s => (
            <span key={s} style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 3, background: 'var(--surface-3)', color: 'var(--text-2)' }}>{s}</span>
          ))}
        </div>
      </div>
      <div>
        {shift ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {shift.blocks.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <span style={{ width: 64, color: 'var(--text-3)', fontFamily: 'monospace', flexShrink: 0 }}>{b.day}</span>
                <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{b.start} → {b.end} PHT</span>
                {b.crossesMidnight && <span style={{ fontSize: 9.5, color: 'var(--text-4)' }}>(overnight)</span>}
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>No shift configured</span>
        )}
      </div>
      <Link
        href={`/candidates?manager=${encodeURIComponent(rawName)}`}
        style={{ fontSize: 11.5, color: 'var(--text-3)', textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        {candidateCount !== undefined && candidateCount > 0 ? `${candidateCount} candidates →` : 'view candidates →'}
      </Link>
    </div>
  )
}
