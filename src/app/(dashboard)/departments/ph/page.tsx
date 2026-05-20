import DepartmentPage from '../_components/DepartmentPage'

export default function PhilippinesPage() {
  return (
    <DepartmentPage
      flag="🇵🇭"
      name="Philippines"
      subtitle="Apple · Darla · Pauline (recruiters) + dedicated training teams"
      conversion={{ pct: 38, color: 'var(--amber)' }}
      kpis={[
        { label: 'In pipeline', value: '173', meta: '↑ 8 from last week' },
        { label: 'In training', value: '39', meta: '4 lanes + TB' },
        { label: 'Active hires', value: '437', meta: '82% of total' },
        { label: 'Avg grade', value: 'B-', meta: '23 stars / 7 fails', color: 'var(--blue)' },
      ]}
      pipeline={[
        { num: 113, label: 'Typeform' },
        { num: 30, label: 'Passed' },
        { num: 21, label: 'Pending' },
        { num: 21, label: 'Scheduled' },
        { num: 39, label: 'Training' },
        { num: 437, label: 'Active' },
      ]}
      gradeDistribution={[
        { grade: 'A', count: 23 },
        { grade: 'B', count: 54 },
        { grade: 'C', count: 61 },
        { grade: 'D', count: 28 },
        { grade: 'F', count: 7 },
      ]}
      lanes={[
        { title: 'Lane A · Week 1 · Joan', meta: '6 trainees · avg B+', tone: 'ok', tag: '81% pass' },
        { title: 'Lane B · Week 1 · Mark', meta: '6 trainees · avg C', tone: 'warn', tag: '58% pass' },
        { title: 'Training Board · Lyka', meta: '8 chatters · Shift 1', tone: 'ok' },
        { title: 'Training Board · Andre', meta: '10 chatters · Shift 2', tone: 'ok' },
      ]}
    />
  )
}
