import type { Metadata } from 'next'
import StatsPage from '@/src/views/StatsPage'

export const metadata: Metadata = {
  title: '통계',
  description: '나의 러닝 통계를 월별 거리 추이, 코스 유형 분포, 베스트 러닝으로 확인하세요.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <StatsPage />
}
