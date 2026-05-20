import DepartmentPage from '../_components/DepartmentPage'

export const dynamic = 'force-dynamic'

export default function UnitedKingdomPage() {
  return (
    <DepartmentPage
      flag="🇬🇧"
      name="United Kingdom"
      regionCode="uk"
      subtitle="Noah · vertical owner · newest region"
      conversion={{ pct: 22, color: 'var(--red)' }}
      conversionNote="conversion rate (placeholder)"
    />
  )
}
