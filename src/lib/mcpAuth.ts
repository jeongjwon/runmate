import crypto from 'crypto'
import prisma from '@/src/lib/prisma'

// Claude 커넥터(MCP)용 OAuth 2.1 인가 서버 로직.
// 클라이언트 등록 정보·인가 코드·액세스 토큰은 NEXTAUTH_SECRET 으로 서명한 문자열이라 DB에 저장하지 않고,
// 연결 1건(mcp_grants)과 리프레시 토큰 해시만 DB에 둔다. 연결을 지우면 그 연결의 토큰은 모두 무효가 된다.

export const ACCESS_TTL = 60 * 60 // 액세스 토큰 1시간
const CODE_TTL = 5 * 60           // 인가 코드 5분

type Purpose = 'client' | 'code' | 'access'

function key(purpose: Purpose): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return crypto.createHmac('sha256', secret).update(`runmate-mcp:${purpose}`).digest()
}

function sign(purpose: Purpose, payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = crypto.createHmac('sha256', key(purpose)).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verify<T>(purpose: Purpose, token: string): T | null {
  const [body, mac, extra] = token.split('.')
  if (!body || !mac || extra !== undefined) return null
  const expected = crypto.createHmac('sha256', key(purpose)).update(body).digest()
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp?: number }
    if (payload.exp && payload.exp < Date.now() / 1000) return null
    return payload
  } catch {
    return null
  }
}

const now = () => Math.floor(Date.now() / 1000)
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

// ── 요청 기준 주소 ─────────────────────────────────────────────────────────────

// 메타데이터의 주소는 사용자가 Claude 에 입력한 주소와 같아야 하므로 요청이 들어온 호스트를 그대로 사용
export function originOf(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!host) return new URL(req.url).origin
  const proto = req.headers.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
}

export const MCP_PATH = '/api/mcp'

// 토큰·등록 엔드포인트는 쿠키를 쓰지 않으므로 어디서든 호출 가능 (브라우저 기반 MCP 클라이언트 대응)
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
}

// ── 클라이언트 등록 (RFC 7591) ─────────────────────────────────────────────────

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']

// 인가 코드를 돌려보낼 수 있는 주소: Claude 의 콜백, 또는 사용자 PC 안에서 도는 클라이언트(Claude Code 등)
export function isAllowedRedirect(uri: string): boolean {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.hash || u.username || u.password) return false
  if (u.protocol === 'https:' && (u.hostname === 'claude.ai' || u.hostname === 'claude.com')) {
    return u.pathname === '/api/mcp/auth_callback'
  }
  return u.protocol === 'http:' && LOOPBACK.includes(u.hostname)
}

interface ClientPayload { r: string[]; n: string; t: number }

export function registerClient(redirectUris: string[], name: string) {
  const payload: ClientPayload = { r: redirectUris, n: name.slice(0, 60), t: now() }
  return { clientId: 'rmc_' + sign('client', payload), issuedAt: payload.t }
}

export function readClient(clientId: string): { redirectUris: string[]; name: string } | null {
  if (!clientId.startsWith('rmc_')) return null
  const p = verify<ClientPayload>('client', clientId.slice(4))
  return p ? { redirectUris: p.r, name: p.n } : null
}

// 등록된 주소와 정확히 같아야 함. 로컬 주소는 실행할 때마다 포트가 바뀔 수 있어 포트만 무시
export function redirectMatches(registered: string[], uri: string): boolean {
  if (!isAllowedRedirect(uri)) return false
  if (registered.includes(uri)) return true
  const u = new URL(uri)
  if (!LOOPBACK.includes(u.hostname)) return false
  return registered.some((r) => {
    const reg = new URL(r)
    return LOOPBACK.includes(reg.hostname) && reg.hostname === u.hostname && reg.pathname === u.pathname
  })
}

// ── 인가 요청 검증 · 코드 발급 ─────────────────────────────────────────────────

export interface AuthorizeParams {
  client_id?: string
  redirect_uri?: string
  response_type?: string
  code_challenge?: string
  code_challenge_method?: string
  state?: string
}

// 인가 요청이 유효하면 클라이언트 정보를, 아니면 사용자에게 보여줄 오류 문구를 돌려줌.
// 여기서 실패한 요청은 redirect_uri 를 믿을 수 없으므로 절대 리다이렉트하지 않는다.
export function checkAuthorize(p: AuthorizeParams): { ok: true; clientName: string } | { ok: false; error: string } {
  const client = p.client_id ? readClient(p.client_id) : null
  if (!client) return { ok: false, error: '등록되지 않은 앱의 요청입니다. Claude에서 커넥터를 다시 추가해 주세요.' }
  if (!p.redirect_uri || !redirectMatches(client.redirectUris, p.redirect_uri)) {
    return { ok: false, error: '허용되지 않은 돌아갈 주소(redirect_uri)입니다.' }
  }
  if (p.response_type !== 'code') return { ok: false, error: '지원하지 않는 요청 방식입니다 (response_type).' }
  if (!p.code_challenge || p.code_challenge_method !== 'S256') {
    return { ok: false, error: 'PKCE(S256)가 없는 요청은 받을 수 없습니다.' }
  }
  return { ok: true, clientName: client.name }
}

interface CodePayload { j: string; u: number; c: string; r: string; p: string; n: string; exp: number }

export function issueCode(userId: number, p: Required<Pick<AuthorizeParams, 'client_id' | 'redirect_uri' | 'code_challenge'>>, clientName: string): string {
  const payload: CodePayload = {
    j: crypto.randomBytes(16).toString('base64url'),
    u: userId,
    c: sha256(p.client_id),
    r: p.redirect_uri,
    p: p.code_challenge,
    n: clientName,
    exp: now() + CODE_TTL,
  }
  return sign('code', payload)
}

// ── 토큰 ───────────────────────────────────────────────────────────────────────

export class OAuthError extends Error {
  constructor(public code: string, description: string) {
    super(description)
  }
}

function issueAccess(grantId: number, userId: number): string {
  return 'rma_' + sign('access', { g: grantId, u: userId, exp: now() + ACCESS_TTL })
}

function tokenResponse(grantId: number, userId: number, refreshToken: string) {
  return {
    access_token: issueAccess(grantId, userId),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL,
    refresh_token: refreshToken,
  }
}

// 인가 코드 → 토큰. 코드는 PKCE 로 요청자와 묶여 있고, code_id 유니크 제약으로 한 번만 쓸 수 있다
export async function exchangeCode(p: { code?: string; client_id?: string; redirect_uri?: string; code_verifier?: string }) {
  const code = p.code ? verify<CodePayload>('code', p.code) : null
  if (!code) throw new OAuthError('invalid_grant', 'authorization code is invalid or expired')
  if (!p.client_id || sha256(p.client_id) !== code.c) throw new OAuthError('invalid_grant', 'client_id does not match')
  if (p.redirect_uri !== undefined && p.redirect_uri !== code.r) throw new OAuthError('invalid_grant', 'redirect_uri does not match')
  if (!p.code_verifier) throw new OAuthError('invalid_request', 'code_verifier is required')
  const challenge = crypto.createHash('sha256').update(p.code_verifier).digest('base64url')
  if (challenge !== code.p) throw new OAuthError('invalid_grant', 'code_verifier does not match')

  const refreshToken = 'rmr_' + crypto.randomBytes(32).toString('base64url')
  let grant
  try {
    grant = await prisma.mcpGrant.create({
      data: { userId: code.u, clientName: code.n, codeId: code.j, refreshHash: sha256(refreshToken) },
    })
  } catch (e: any) {
    if (e?.code === 'P2002') throw new OAuthError('invalid_grant', 'authorization code was already used')
    throw e
  }
  return tokenResponse(grant.id, grant.userId, refreshToken)
}

// 리프레시 토큰 → 새 액세스 토큰. 리프레시 토큰은 연결을 해제할 때까지 그대로 유지
// (여러 대화에서 동시에 갱신해도 서로의 토큰을 무효로 만들지 않도록 회전하지 않음)
export async function refreshAccess(p: { refresh_token?: string }) {
  const grant = p.refresh_token
    ? await prisma.mcpGrant.findUnique({ where: { refreshHash: sha256(p.refresh_token) } })
    : null
  if (!grant) throw new OAuthError('invalid_grant', 'refresh token is invalid or revoked')
  return tokenResponse(grant.id, grant.userId, p.refresh_token!)
}

// MCP 요청의 Bearer 토큰 확인. 서명·만료 확인 후 연결이 아직 살아 있는지 DB에서 확인
export async function authenticateMcp(req: Request): Promise<{ userId: number } | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = /^Bearer\s+rma_(\S+)$/i.exec(header)?.[1]
  const payload = token ? verify<{ g: number; u: number; exp: number }>('access', token) : null
  if (!payload) return null

  const grant = await prisma.mcpGrant.findFirst({ where: { id: payload.g, userId: payload.u } })
  if (!grant) return null

  // 마지막 사용 시각은 10분에 한 번만 갱신
  if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > 10 * 60 * 1000) {
    await prisma.mcpGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  }
  return { userId: grant.userId }
}
