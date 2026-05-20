'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SegmentLink({
  segment,
  children,
  style,
  block,
}: {
  segment: string
  children: React.ReactNode
  style?: React.CSSProperties
  block?: boolean
}) {
  const pathname = usePathname()
  return (
    <Link
      href={`${pathname}?segment=${segment}`}
      scroll={false}
      style={{ textDecoration: 'none', color: 'inherit', display: block ? 'block' : 'inline', ...style }}
    >
      {children}
    </Link>
  )
}
