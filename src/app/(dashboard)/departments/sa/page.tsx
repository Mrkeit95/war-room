import DepartmentPage from '../_components/DepartmentPage'

export default function SouthAmericaPage() {
  return (
    <DepartmentPage
      flag="🇧🇷"
      name="South America"
      regionCode="sa"
      subtitle="Sebastien · vertical owner"
      conversion={{ pct: 35, color: 'var(--amber)' }}
      kpis={[
        { label: 'In pipeline', value: '29', meta: '8 new typeforms', segment: 'sa:all' },
        { label: 'In training', value: '18', meta: '1 lane active', segment: 'sa:training' },
        { label: 'Active hires', value: '29', meta: '7% of total', segment: 'sa:active' },
        { label: 'Avg grade', value: 'C+', meta: '2 stars / 2 at risk', color: 'var(--yellow)' },
      ]}
      pipeline={[
        { num: 8, label: 'Typeform', segment: 'sa:typeform' },
        { num: 3, label: 'Pending interview', segment: 'sa:pending' },
        { num: 18, label: 'W1', segment: 'sa:training' },
        { num: 29, label: 'Active', segment: 'sa:active' },
      ]}
    />
  )
}
