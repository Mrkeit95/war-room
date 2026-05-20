import DepartmentPage from '../_components/DepartmentPage'

export default function UnitedKingdomPage() {
  return (
    <DepartmentPage
      flag="🇬🇧"
      name="United Kingdom"
      regionCode="uk"
      subtitle="Noah · vertical owner · newest region"
      conversion={{ pct: 22, color: 'var(--red)' }}
      kpis={[
        { label: 'In pipeline', value: '9', meta: '3 new typeforms', segment: 'uk:all' },
        { label: 'In training', value: '2', meta: 'Smallest cohort', segment: 'uk:training' },
        { label: 'Active hires', value: '11', meta: '3% of total', segment: 'uk:active' },
        { label: 'Avg grade', value: 'C', meta: '1 star / 2 at risk', color: 'var(--red)' },
      ]}
      pipeline={[
        { num: 3, label: 'Typeform', segment: 'uk:typeform' },
        { num: 4, label: 'Pending interview', segment: 'uk:pending' },
        { num: 1, label: 'W1', segment: 'uk:training' },
        { num: 1, label: 'W2', segment: 'uk:training' },
        { num: 11, label: 'Active', segment: 'uk:active' },
      ]}
    />
  )
}
