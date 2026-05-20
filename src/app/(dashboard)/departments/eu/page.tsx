import DepartmentPage from '../_components/DepartmentPage'

export const dynamic = 'force-dynamic'

export default function EuropePage() {
  return (
    <DepartmentPage
      flag="🇪🇺"
      name="Europe"
      regionCode="eu"
      subtitle="Aleksandar · vertical owner"
      conversion={{ pct: 41, color: 'var(--green)' }}
      conversionNote="conversion rate (placeholder)"
    />
  )
}
