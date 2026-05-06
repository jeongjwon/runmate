import type { Metadata } from 'next'
import LoginPage from '@/src/views/LoginPage'

export const metadata: Metadata = {
  title: '로그인',
  description: 'Google, Kakao, Naver 소셜 계정으로 간편하게 로그인하세요.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LoginPage />
}
