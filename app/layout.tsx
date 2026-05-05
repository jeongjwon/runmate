import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/src/components/Providers'
import Nav from '@/src/components/Nav'
import Snackbar from '@/src/components/Snackbar'
import ConfirmModal from '@/src/components/ConfirmModal'

export const metadata: Metadata = {
  title: 'RunMate',
  description: '한국 마라톤 일정 조회, 참가 신청, 러닝 기록 관리',
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <Nav />
            <main className="max-w-5xl mx-auto px-4 py-6 pb-24 sm:pb-10">
              {children}
            </main>
            <Snackbar />
            <ConfirmModal />
          </div>
        </Providers>
      </body>
    </html>
  )
}
