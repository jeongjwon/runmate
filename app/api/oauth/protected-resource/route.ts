import { NextRequest, NextResponse } from 'next/server'
import { originOf, CORS_HEADERS, MCP_PATH } from '@/src/lib/mcpAuth'

export const dynamic = 'force-dynamic'

// OAuth 보호 리소스 메타데이터 (RFC 9728). /.well-known/oauth-protected-resource 로 노출 (next.config.js rewrites)
export function GET(req: NextRequest) {
  const origin = originOf(req)
  return NextResponse.json(
    {
      resource: origin + MCP_PATH,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      resource_name: 'RunMate',
    },
    { headers: CORS_HEADERS },
  )
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
