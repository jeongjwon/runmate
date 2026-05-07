import Link from 'next/link'

const LINKS = [
  { href: '/about',   label: '소개' },
  { href: '/contact', label: '문의' },
  { href: '/privacy', label: '개인정보처리방침' },
  { href: '/terms',   label: '이용약관' },
]

export default function Footer() {
  return (
    <footer className="mt-12 pt-6 border-t border-[var(--border)]">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mb-3">
        {LINKS.map((l, i) => (
          <span key={l.href} className="flex items-center gap-4">
            <Link
              href={l.href}
              className="text-xs text-[var(--text3)] hover:text-[var(--navy)] transition-colors"
            >
              {l.label}
            </Link>
            {i < LINKS.length - 1 && (
              <span className="text-[var(--border)] text-xs select-none">|</span>
            )}
          </span>
        ))}
      </div>
      <p className="text-center text-[10px] text-[var(--text3)] pb-6">
        © {new Date().getFullYear()} RunMate. All rights reserved.
      </p>
    </footer>
  )
}
