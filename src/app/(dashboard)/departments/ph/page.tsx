import DepartmentPage from '../_components/DepartmentPage'

export const dynamic = 'force-dynamic'

export default function PhilippinesPage() {
  return (
    <DepartmentPage
      flag="🇵🇭"
      name="Philippines"
      regionCode="ph"
      subtitle="Apple · Darla · Pauline (recruiters) + dedicated training teams"
      conversion={{ pct: 38, color: 'var(--amber)' }}
      conversionNote="conversion rate (placeholder)"
      lanes={[
        { title: 'Lane A · Week 1 · Joan', meta: '6 trainees · avg B+', tone: 'ok', tag: '81% pass' },
        { title: 'Lane B · Week 1 · Mark', meta: '6 trainees · avg C', tone: 'warn', tag: '58% pass' },
        { title: 'Training Board · Lyka', meta: '8 chatters · Shift 1', tone: 'ok' },
        { title: 'Training Board · Andre', meta: '10 chatters · Shift 2', tone: 'ok' },
      ]}
    />
  )
}
