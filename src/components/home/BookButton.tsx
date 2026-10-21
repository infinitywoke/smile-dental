'use client'

import { usePathname } from 'next/navigation'
import { NavLink } from './NavLink'
import { linksFor } from './site-links'

// "Book appointment": the booking card on this page if it has one, otherwise the booking page
export function BookButton({ className, onClick, tabIndex, children = 'Book appointment' }: {
  className?: string
  onClick?: () => void
  tabIndex?: number
  children?: React.ReactNode
}) {
  return (
    <NavLink href={linksFor(usePathname()).book} className={className} onClick={onClick} tabIndex={tabIndex}>
      {children}
    </NavLink>
  )
}
