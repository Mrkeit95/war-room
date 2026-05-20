import CandidateLink from '@/components/CandidateLink'
import { CANDIDATES, nameToId, gradeBg, gradeColors } from '@/lib/candidates'

const STAGES = [
  { key: 'typeform', label: 'Typeform', count: 127 },
  { key: 'passed', label: 'Passed', count: 32 },
  { key: 'pending', label: 'Pending interview', count: 16 },
  { key: 'scheduled', label: 'Scheduled interview', count: 8 },
  { key: 'training', label: 'Training', count: 68 },
  { key: 'standby', label: 'Standby', count: 53 },
  { key: 'active', label: 'Active', count: 437 },
]

const CARDS: Record<string, { name: string; grade: string | null; region: string; manager: string; days: number }[]> = {
  typeform: [
    { name: 'FSF', grade: null, region: 'UK', manager: 'Noah', days: 5 },
    { name: 'Noah Whall', grade: null, region: 'UK', manager: 'Noah', days: 5 },
    { name: 'NOAH', grade: null, region: 'UK', manager: 'Noah', days: 6 },
    { name: 'John K.', grade: null, region: 'UK', manager: 'Noah', days: 5 },
  ],
  pending: [
    { name: 'Carlos M.', grade: 'B', region: 'SA', manager: 'Sebastien', days: 6 },
    { name: 'Lucia R.', grade: 'C', region: 'SA', manager: 'Sebastien', days: 5 },
    { name: 'Diego F.', grade: 'D', region: 'SA', manager: 'Sebastien', days: 4 },
  ],
  scheduled: [
    { name: 'Jenna K.', grade: 'A', region: 'PH', manager: 'Apple', days: 0 },
    { name: 'Maria S.', grade: null, region: 'PH', manager: 'Apple', days: 0 },
    { name: 'Lena W.', grade: null, region: 'EU', manager: 'Aleksandar', days: 0 },
    { name: 'Pablo G.', grade: 'C', region: 'SA', manager: 'Sebastien', days: 0 },
  ],
  training: [
    { name: 'Maria L.', grade: 'A', region: 'EU', manager: 'Aleksandar', days: 3 },
    { name: 'Ivan P.', grade: 'D', region: 'EU', manager: 'Aleksandar', days: 3 },
    { name: 'Anna G.', grade: 'A', region: 'PH', manager: 'Joan', days: 3 },
    { name: 'Bea M.', grade: 'A', region: 'PH', manager: 'Mark', days: 3 },
    { name: 'Maja P.', grade: 'F', region: 'PH', manager: 'Mark', days: 3 },
    { name: 'James T.', grade: 'D', region: 'UK', manager: 'Noah', days: 5 },
  ],
  passed: [], standby: [], active: [],
}

function resolveId(name: string): string | null {
  const direct = nameToId(name)
  if (CANDIDATES[direct]) return direct
  for (const [id, c] of Object.entries(CANDIDATES)) if (c.name === name) return id
  return null
}

export default function PipelinePage() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Pipeline</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Every candidate across every region in motion.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(160px, 1fr))', gap: 10, overflowX: 'auto', paddingBottom: 20 }}>
        {STAGES.map(stage => (
          <div key={stage.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', fontWeight: 600 }}>{stage.label}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)', background: 'var(--surface-3)', padding: '2px 7px', borderRadius: 10 }}>{stage.count}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(CARDS[stage.key] || []).map(card => {
                const id = resolveId(card.name)
                const inner = (
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: id ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {card.grade ? (
                        <div style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, background: gradeBg[card.grade], color: gradeColors[card.grade] }}>{card.grade}</div>
                      ) : (
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--surface-3)', flexShrink: 0 }} />
                      )}
                      <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--surface-3)', fontSize: 10 }}>{card.region}</span>
                      <span>{card.manager}</span>
                      {card.days > 0 && <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 10, color: card.days >= 5 ? 'var(--red)' : card.days >= 3 ? 'var(--amber)' : 'var(--green)' }}>{card.days}d</span>}
                    </div>
                  </div>
                )
                return id ? (
                  <CandidateLink key={card.name} id={id} block>{inner}</CandidateLink>
                ) : (
                  <div key={card.name}>{inner}</div>
                )
              })}
              {(CARDS[stage.key] || []).length === 0 && (
                <div style={{ color: 'var(--text-4)', fontSize: 11, padding: '8px 0', fontStyle: 'italic' }}>No visible candidates</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
