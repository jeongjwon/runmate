import { NextRequest, NextResponse } from 'next/server'
import { originOf, CORS_HEADERS } from '@/src/lib/mcpAuth'

export const dynamic = 'force-dynamic'

// OAuth 인가 서버 메타데이터 (RFC 8414). /.well-known/oauth-authorization-server 로 노출 (next.config.js rewrites)
export function GET(req: NextRequest) {
  const origin = originOf(req)
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    },
    { headers: CORS_HEADERS },
  )
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
