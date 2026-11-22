import type { Metadata } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import { checkAuthorize } from '@/src/lib/mcpAuth'
import McpAuthorizePage from '@/src/views/McpAuthorizePage'

export const metadata: Metadata = {
  title: 'Claude 연결 | RunMate',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// Claude 커넥터 연결 동의 화면. 요청이 유효한지는 서버에서 먼저 확인
export default async function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const params = {
    client_id: one(searchParams.client_id),
    redirect_uri: one(searchParams.redirect_uri),
    response_type: one(searchParams.response_type),
    code_challenge: one(searchParams.code_challenge),
    code_challenge_method: one(searchParams.code_challenge_method),
    state: one(searchParams.state),
  }
  const check = checkAuthorize(params)
  const session = await getServerSession(authOptions)

  return (
    <McpAuthorizePage
      params={params}
      error={check.ok ? null : check.error}
      clientName={check.ok ? check.clientName : ''}
      userName={session?.user?.name ?? null}
    />
  )
}
