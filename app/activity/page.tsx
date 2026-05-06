import type { Metadata } from 'next'
import ActivityPage from '@/src/views/ActivityPage'

export const metadata: Metadata = {
  title: '활동 기록',
  description: '나의 러닝 기록을 관리하고 주간·월간·연간 통계를 확인하세요. CSV, TCX 파일로 기록을 가져올 수 있습니다.',
  openGraph: {
    title: '활동 기록 | RunMate',
    description: '나의 러닝 기록과 통계를 한눈에 확인하세요.',
  },
}

export default function Page() {
  return <ActivityPage />
}
