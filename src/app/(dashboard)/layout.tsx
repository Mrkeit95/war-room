import { Suspense } from 'react'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import CandidateModal from '@/components/CandidateModal'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--canvas)', minHeight: '100vh' }}>
        <Topbar />
        <main style={{ flex: 1, padding: '28px 32px 60px', maxWidth: 1640, width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <CandidateModal />
      </Suspense>
    </div>
  )
}
