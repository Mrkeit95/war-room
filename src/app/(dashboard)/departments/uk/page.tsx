import DepartmentPage from '../_components/DepartmentPage'

export default function UnitedKingdomPage() {
  return (
    <DepartmentPage
      flag="🇬🇧"
      name="United Kingdom"
      subtitle="Noah · vertical owner · newest region"
      conversion={{ pct: 22, color: 'var(--red)' }}
      kpis={[
        { label: 'In pipeline', value: '9', meta: '3 new typeforms' },
        { label: 'In training', value: '2', meta: 'Smallest cohort' },
        { label: 'Active hires', value: '11', meta: '3% of total' },
        { label: 'Avg grade', value: 'C', meta: '1 star / 2 at risk', color: 'var(--red)' },
      ]}
      pipeline={[
        { num: 3, label: 'Typeform' },
        { num: 4, label: 'Pending' },
        { num: 1, label: 'W1' },
        { num: 1, label: 'W2' },
        { num: 11, label: 'Active' },
      ]}
    />
  )
}
