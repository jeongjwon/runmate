import { NextRequest, NextResponse } from 'next/server'
import { isAllowedRedirect, registerClient, CORS_HEADERS } from '@/src/lib/mcpAuth'

// 동적 클라이언트 등록 (RFC 7591). 등록 정보는 서명된 client_id 안에 담겨 DB에 쓰지 않는다
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const uris: unknown[] = Array.isArray(body?.redirect_uris) ? body.redirect_uris : []

  // Claude 콜백과 로컬 주소만 허용: 다른 사이트로 인가 코드를 보내도록 등록할 수 없다
  const allowed = uris.filter((u): u is string => typeof u === 'string' && isAllowedRedirect(u)).slice(0, 10)
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be the Claude callback or a loopback address' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim() : 'MCP client'
  const { clientId, issuedAt } = registerClient(allowed, name)

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name: name.slice(0, 60),
      redirect_uris: allowed,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { status: 201, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
  )
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
