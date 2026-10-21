import type { Metadata } from 'next'

// The new website stays out of search until it replaces the old one
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children
}
