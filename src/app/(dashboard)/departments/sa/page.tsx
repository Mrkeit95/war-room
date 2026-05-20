import DepartmentPage from '../_components/DepartmentPage'

export default function SouthAmericaPage() {
  return (
    <DepartmentPage
      flag="🇧🇷"
      name="South America"
      subtitle="Sebastien · vertical owner"
      conversion={{ pct: 35, color: 'var(--amber)' }}
      kpis={[
        { label: 'In pipeline', value: '29', meta: '8 new typeforms' },
        { label: 'In training', value: '18', meta: '1 lane active' },
        { label: 'Active hires', value: '29', meta: '7% of total' },
        { label: 'Avg grade', value: 'C+', meta: '2 stars / 2 at risk', color: 'var(--yellow)' },
      ]}
      pipeline={[
        { num: 8, label: 'Typeform' },
        { num: 3, label: 'Pending' },
        { num: 18, label: 'W1' },
        { num: 29, label: 'Active' },
      ]}
    />
  )
}
