import DepartmentPage from '../_components/DepartmentPage'

export default function EuropePage() {
  return (
    <DepartmentPage
      flag="🇪🇺"
      name="Europe"
      regionCode="eu"
      subtitle="Aleksandar · vertical owner"
      conversion={{ pct: 41, color: 'var(--green)' }}
      kpis={[
        { label: 'In pipeline', value: '33', meta: '3 new this week', segment: 'eu:all' },
        { label: 'In training', value: '24', meta: 'Exp + Non-Exp', segment: 'eu:training' },
        { label: 'Active hires', value: '42', meta: '10% of total', segment: 'eu:active' },
        { label: 'Avg grade', value: 'B+', meta: '5 stars / 0 fails', color: 'var(--green)' },
      ]}
      pipeline={[
        { num: 3, label: 'Typeform', segment: 'eu:typeform' },
        { num: 6, label: 'Pending interview', segment: 'eu:pending' },
        { num: 15, label: 'W1 Non-Exp', segment: 'eu:training' },
        { num: 7, label: 'W1 Exp', segment: 'eu:training' },
        { num: 2, label: 'W2', segment: 'eu:training' },
        { num: 42, label: 'Active', segment: 'eu:active' },
      ]}
    />
  )
}
