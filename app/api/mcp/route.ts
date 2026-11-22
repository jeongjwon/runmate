import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcp, originOf, CORS_HEADERS } from '@/src/lib/mcpAuth'
import { TOOLS, ToolError, callTool, hasTool } from '@/src/lib/mcpTools'

// Claude 커넥터용 원격 MCP 서버 (Streamable HTTP, 상태 없음).
// 요청 하나에 JSON 응답 하나만 돌려주며, 서버가 먼저 보내는 메시지(SSE 스트림)는 쓰지 않는다.

export const dynamic = 'force-dynamic'

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS =
  'RunMate는 사용자의 러닝 기록, 주간 훈련 계획, 신발, 참가 대회를 관리하는 서비스입니다. ' +
  '날짜는 모두 한국 시간 기준 YYYY-MM-DD 입니다. 훈련 계획을 짜거나 수정하기 전에 get_overview 로 오늘 날짜와 최근 훈련량, 다가오는 대회를 확인하고, ' +
  '확정된 계획은 save_plans 로 저장하면 RunMate 활동 캘린더에 바로 표시됩니다.'

type Json = Record<string, any>

const rpcResult = (id: unknown, result: Json) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

async function handle(msg: any, userId: number): Promise<Json | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    // 클라이언트가 보낸 응답 메시지(method 없음)는 받을 것이 없으므로 무시
    if (msg && typeof msg === 'object' && msg.jsonrpc === '2.0' && ('result' in msg || 'error' in msg)) return null
    return rpcError(msg?.id ?? null, -32600, 'Invalid Request')
  }
  // id 가 없는 메시지는 알림: 응답하지 않음
  if (msg.id === undefined || msg.id === null) return null

  const { id, method, params } = msg
  switch (method) {
    case 'initialize': {
      const wanted = params?.protocolVersion
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'runmate', title: 'RunMate', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })
    case 'tools/call': {
      const name = params?.name
      if (typeof name !== 'string' || !hasTool(name)) return rpcError(id, -32602, `Unknown tool: ${name}`)
      try {
        const data = await callTool(userId, name, params?.arguments)
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false })
      } catch (e: any) {
        if (!(e instanceof ToolError)) console.error(`[mcp] ${name} failed:`, e)
        // 도구 실행 오류는 프로토콜 오류가 아니라 결과로 돌려줘야 Claude 가 내용을 보고 고쳐서 다시 시도할 수 있다
        const text = e instanceof ToolError ? e.message : '서버 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        return rpcResult(id, { content: [{ type: 'text', text }], isError: true })
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateMcp(req)
  if (!auth) {
    // 401 + 메타데이터 위치를 알려주면 Claude 가 OAuth 로그인 절차를 시작한다
    const hadToken = !!req.headers.get('authorization')
    return NextResponse.json(
      { error: 'unauthorized' },
      {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          'WWW-Authenticate':
            `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource"` +
            (hadToken ? ', error="invalid_token"' : ''),
        },
      },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: CORS_HEADERS })
  }

  if (Array.isArray(body)) {
    if (body.length === 0) return NextResponse.json(rpcError(null, -32600, 'Invalid Request'), { status: 400, headers: CORS_HEADERS })
    const out = []
    for (const m of body) {
      const res = await handle(m, auth.userId)
      if (res) out.push(res)
    }
    return out.length
      ? NextResponse.json(out, { headers: CORS_HEADERS })
      : new NextResponse(null, { status: 202, headers: CORS_HEADERS })
  }

  const res = await handle(body, auth.userId)
  return res
    ? NextResponse.json(res, { headers: CORS_HEADERS })
    : new NextResponse(null, { status: 202, headers: CORS_HEADERS })
}

// 서버가 먼저 보내는 스트림과 세션 종료는 지원하지 않음
const notAllowed = () => new NextResponse(null, { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST' } })
export const GET = notAllowed
export const DELETE = notAllowed

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
