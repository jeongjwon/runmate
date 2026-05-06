import type { Metadata } from 'next'
import MarathonsPage from '@/src/views/MarathonsPage'

export const metadata: Metadata = {
  title: '마라톤 일정',
  description: '전국 마라톤 대회 일정을 확인하고 내 마라톤에 추가해보세요. 5K, 10K, 하프, 풀코스 등 다양한 종목을 지역별로 검색할 수 있습니다.',
  openGraph: {
    title: '마라톤 일정 | RunMate',
    description: '전국 마라톤 대회 일정을 확인하고 참가 신청하세요.',
  },
}

export default function Page() {
  return <MarathonsPage />
}
