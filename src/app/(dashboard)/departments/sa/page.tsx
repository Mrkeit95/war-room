import DepartmentPage from '../_components/DepartmentPage'

export const dynamic = 'force-dynamic'

export default function SouthAmericaPage() {
  return (
    <DepartmentPage
      flag="🇨🇴"
      name="South America"
      regionCode="sa"
      subtitle="Sebastien · vertical owner"
      conversion={{ pct: 35, color: 'var(--amber)' }}
      conversionNote="conversion rate (placeholder)"
    />
  )
}
