import Link from 'next/link'

// A section of this page (#book) stays a plain link, so the page just scrolls; another page opens
// without reloading the site
export function NavLink({ href, ...rest }: React.ComponentProps<'a'> & { href: string }) {
  return href.startsWith('#') ? <a href={href} {...rest} /> : <Link href={href} {...rest} />
}
