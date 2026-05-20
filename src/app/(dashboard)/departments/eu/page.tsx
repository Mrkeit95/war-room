import DepartmentPage from '../_components/DepartmentPage'

export default function EuropePage() {
  return (
    <DepartmentPage
      flag="🇪🇺"
      name="Europe"
      subtitle="Aleksandar · vertical owner"
      conversion={{ pct: 41, color: 'var(--green)' }}
      kpis={[
        { label: 'In pipeline', value: '33', meta: '3 new this week' },
        { label: 'In training', value: '24', meta: 'Exp + Non-Exp' },
        { label: 'Active hires', value: '42', meta: '10% of total' },
        { label: 'Avg grade', value: 'B+', meta: '5 stars / 0 fails', color: 'var(--green)' },
      ]}
      pipeline={[
        { num: 3, label: 'Typeform' },
        { num: 6, label: 'Pending' },
        { num: 15, label: 'W1 Non-Exp' },
        { num: 7, label: 'W1 Exp' },
        { num: 2, label: 'W2' },
        { num: 42, label: 'Active' },
      ]}
    />
  )
}
