import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import { checkAuthorize, issueCode } from '@/src/lib/mcpAuth'

// 동의 화면(/oauth/authorize)에서 허용·거부를 누르면 호출. 로그인 세션(쿠키)으로 본인 확인 후
// Claude 로 돌아갈 주소를 만들어 준다
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const check = checkAuthorize(body)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const redirect = new URL(body.redirect_uri)
  if (body.approve === true) {
    redirect.searchParams.set('code', issueCode(session.user.id, body, check.clientName))
  } else {
    redirect.searchParams.set('error', 'access_denied')
  }
  if (typeof body.state === 'string') redirect.searchParams.set('state', body.state)

  return NextResponse.json({ redirect: redirect.toString() })
}
