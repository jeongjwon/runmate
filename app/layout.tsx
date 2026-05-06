import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/src/components/Providers'
import Nav from '@/src/components/Nav'
import Snackbar from '@/src/components/Snackbar'
import ConfirmModal from '@/src/components/ConfirmModal'

const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'RunMate — 한국 마라톤 일정 & 러닝 기록',
    template: '%s | RunMate',
  },
  description: '국내 마라톤 대회 일정 조회, 참가 신청, 러닝 기록 관리를 한 곳에서. 5K부터 풀코스까지 전국 마라톤 대회를 찾아보세요.',
  keywords: ['마라톤', '러닝', '달리기', '마라톤 일정', '마라톤 대회', '러닝 기록', '풀코스', '하프마라톤'],
  authors: [{ name: 'RunMate' }],
  creator: 'RunMate',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'RunMate',
    title: 'RunMate — 한국 마라톤 일정 & 러닝 기록',
    description: '국내 마라톤 대회 일정 조회, 참가 신청, 러닝 기록 관리를 한 곳에서.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'RunMate' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RunMate — 한국 마라톤 일정 & 러닝 기록',
    description: '국내 마라톤 대회 일정 조회, 참가 신청, 러닝 기록 관리.',
    images: ['/opengraph-image'],
  },
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
  robots: { index: true, follow: true },
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
          <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <Nav />
            <main className="flex-1 min-w-0 bg-white overflow-y-auto">
              <div className="max-w-5xl mx-auto px-6 py-5 pb-24 sm:pb-6">
                {children}
              </div>
            </main>
          </div>
          <Snackbar />
          <ConfirmModal />
        </Providers>
      </body>
    </html>
  )
}
