import type { Metadata } from 'next'
import ParticipationsPage from '@/src/views/ParticipationsPage'

export const metadata: Metadata = {
  title: '내 마라톤',
  description: '참가 신청한 마라톤 대회 목록과 완주 기록을 관리하세요.',
  openGraph: {
    title: '내 마라톤 | RunMate',
    description: '참가 신청한 마라톤 대회와 완주 기록을 관리하세요.',
  },
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ParticipationsPage />
}
