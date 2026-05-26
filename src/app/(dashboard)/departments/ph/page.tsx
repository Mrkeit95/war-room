import DepartmentPage from '../_components/DepartmentPage'

export const dynamic = 'force-dynamic'

export default function PhilippinesPage() {
  return (
    <DepartmentPage
      flag="🇵🇭"
      name="Philippines"
      regionCode="ph"
      subtitle="Recruiting: Pauline · Daireen · Apple. Training (Allyson Sam): Andrei + Jose (8am–4pm PHT), Pamela + Arjay (rotating EST), Prince + Gwyneth (rotating EST). AEs: Day (Board 1), Angie (Board 2), Iori (Board 3)."
      conversion={{ pct: 38, color: 'var(--amber)' }}
      conversionNote="conversion rate (placeholder)"
    />
  )
}
