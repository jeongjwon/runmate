import { NextRequest, NextResponse } from 'next/server'
import { OAuthError, exchangeCode, refreshAccess, CORS_HEADERS } from '@/src/lib/mcpAuth'

const HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' }

// 토큰 엔드포인트: 인가 코드 교환(authorization_code)과 갱신(refresh_token)
export async function POST(req: NextRequest) {
  // 표준은 application/x-www-form-urlencoded, 일부 클라이언트는 JSON 으로 보냄
  let p: Record<string, string> = {}
  try {
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      p = await req.json()
    } else {
      p = Object.fromEntries(new URLSearchParams(await req.text()))
    }
  } catch {
    return NextResponse.json({ error: 'invalid_request', error_description: 'malformed body' }, { status: 400, headers: HEADERS })
  }

  try {
    if (p.grant_type === 'authorization_code') {
      return NextResponse.json(await exchangeCode(p), { headers: HEADERS })
    }
    if (p.grant_type === 'refresh_token') {
      return NextResponse.json(await refreshAccess(p), { headers: HEADERS })
    }
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'use authorization_code or refresh_token' },
      { status: 400, headers: HEADERS },
    )
  } catch (e: any) {
    if (e instanceof OAuthError) {
      return NextResponse.json({ error: e.code, error_description: e.message }, { status: 400, headers: HEADERS })
    }
    console.error('[oauth] token error:', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: HEADERS })
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
