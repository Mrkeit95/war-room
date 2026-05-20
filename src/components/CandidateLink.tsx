'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function CandidateLink({
  id,
  children,
  style,
  block,
}: {
  id: string
  children: React.ReactNode
  style?: React.CSSProperties
  block?: boolean
}) {
  const pathname = usePathname()
  return (
    <Link
      href={`${pathname}?candidate=${id}`}
      scroll={false}
      style={{ textDecoration: 'none', color: 'inherit', display: block ? 'block' : 'inline', ...style }}
    >
      {children}
    </Link>
  )
}
