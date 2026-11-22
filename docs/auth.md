# 인증 (Auth)

## 개요

NextAuth v4를 사용하며 **JWT 세션 전략**으로 동작합니다. 별도의 세션 DB 테이블 없이 JWT 토큰 안에 사용자 식별자(`dbUserId`)를 담아 유지합니다.

## 지원 OAuth 제공자

| 제공자 | 환경 변수 | 스코프 |
|--------|-----------|--------|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | profile, email |
| Kakao | `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` | profile_nickname, profile_image, account_email |
| Naver | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | profile (name, email, profile_image) |

## 콜백 흐름

### 1. `signIn` 콜백 — DB 사용자 동기화

소셜 로그인 성공 시 `users` 테이블에 upsert합니다.  
`(provider, providerId)` 복합 유니크 키로 중복 가입을 방지합니다.

```ts
// src/lib/auth.ts
async signIn({ user, account }) {
  await upsertUser(account.provider, account.providerAccountId, {
    name: user.name,
    email: user.email,
    picture: user.image,
  })
  return true
}
```

### 2. `jwt` 콜백 — 토큰에 DB userId 저장

최초 로그인(`account` 존재 시) DB에서 사용자를 조회해 `token.dbUserId`를 기록합니다.  
이후 요청에서는 `dbUserId`가 DB에 실제로 존재하는지 재검증합니다 — DB 초기화 이후 stale 토큰 문제를 방지합니다.

```ts
async jwt({ token, account }) {
  if (account) {
    const dbUser = await prisma.user.findUnique({ where: { provider_providerId: ... } })
    if (dbUser) token.dbUserId = dbUser.id
  } else if (token.dbUserId) {
    // DB에 해당 유저가 없으면 토큰 무효화
    const exists = await prisma.user.findUnique({ where: { id: token.dbUserId } })
    if (!exists) token.dbUserId = undefined
  }
  return token
}
```

### 3. `session` 콜백 — 세션에 id 노출

```ts
async session({ session, token }) {
  if (session.user && token.dbUserId) {
    session.user.id = token.dbUserId
  }
  return session
}
```

## Route Handler에서 인증 확인

```ts
// app/api/*/route.ts
const session = await getServerSession(authOptions)
if (!session?.user?.id) {
  return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
}
const userId = session.user.id
```

## 클라이언트에서 세션 사용

```ts
// src/views/*.tsx
import { useSession } from 'next-auth/react'
const { data: session } = useSession()
if (!session) { /* 비로그인 처리 */ }
```

## TypeScript 타입 확장

NextAuth 기본 타입에 `id: number`를 추가합니다.

```ts
// src/types/next-auth.d.ts (또는 별도 선언)
declare module 'next-auth' {
  interface Session {
    user: { id: number; name?: string; email?: string; image?: string }
  }
}
declare module 'next-auth/jwt' {
  interface JWT { dbUserId?: number }
}
```

## 소셜 로그인 콜백 URL 설정

각 OAuth 콘솔에 다음 URL을 등록해야 합니다.

```
https://{도메인}/api/auth/callback/google
https://{도메인}/api/auth/callback/kakao
https://{도메인}/api/auth/callback/naver
```

로컬 개발 시에는 `http://localhost:3000`을 허용 도메인으로 추가합니다.

## Claude 커넥터 OAuth (MCP)

Claude(웹·데스크톱·모바일)가 `/api/mcp`를 호출할 수 있도록 RunMate가 직접 OAuth 2.1 인가 서버 역할을 합니다.  
소셜 로그인(NextAuth)과는 별개의 흐름이며, 사용자 확인 단계에서만 NextAuth 세션을 사용합니다.  
구현은 `src/lib/mcpAuth.ts`와 `app/api/oauth/*`에 있습니다.

### 연결 방법 (사용자)

1. RunMate 프로필 메뉴 › **Claude 연동**에서 커넥터 주소(`https://{도메인}/api/mcp`)를 복사
2. Claude 설정 › 커넥터 › **커스텀 커넥터 추가**에 이름과 주소 입력
3. 연결을 누르면 RunMate 동의 화면(`/oauth/authorize`)이 열림 → 로그인 → **허용**

OAuth 클라이언트 ID·시크릿은 입력하지 않습니다 (동적 등록). Claude 쪽에서 클라이언트 방식을 고르라고 하면 자동 등록을 선택합니다.

### 흐름

```
Claude ── POST /api/mcp (토큰 없음) ──────────────▶ 401 + WWW-Authenticate: Bearer resource_metadata="…"
Claude ── GET /.well-known/oauth-protected-resource ─▶ { resource, authorization_servers }
Claude ── GET /.well-known/oauth-authorization-server ▶ { authorize / token / register 주소, S256 }
Claude ── POST /api/oauth/register ────────────────▶ client_id (rmc_…)
브라우저 ─ GET /oauth/authorize?client_id&redirect_uri&code_challenge… ─▶ 동의 화면
브라우저 ─ POST /api/oauth/authorize { approve } ───▶ { redirect: "…/auth_callback?code=…&state=…" }
Claude ── POST /api/oauth/token (code + code_verifier) ─▶ access_token (rma_…) + refresh_token (rmr_…)
Claude ── POST /api/mcp (Authorization: Bearer rma_…) ─▶ 도구 호출
```

`/.well-known/*` 두 주소는 `next.config.js`의 `rewrites()`로 `/api/oauth/protected-resource`, `/api/oauth/authorization-server`에 연결됩니다.

### 토큰

| 종류 | 형식 | 수명 | 저장 |
|------|------|------|------|
| 클라이언트 ID | `rmc_` + 서명된 값 (redirect URI·이름 포함) | 없음 | 저장 안 함 (서명 검증) |
| 인가 코드 | 서명된 값 (사용자·클라이언트·redirect URI·PKCE challenge 포함) | 5분 | `mcp_grants.code_id`로 1회 사용만 보장 |
| 액세스 토큰 | `rma_` + 서명된 값 (연결 id·사용자 id) | 1시간 | 저장 안 함 (서명 검증 + 연결 존재 확인) |
| 리프레시 토큰 | `rmr_` + 랜덤 32바이트 | 연결 해제 전까지 | SHA-256 해시만 `mcp_grants.refresh_hash`에 저장 |

- 서명은 `NEXTAUTH_SECRET`에서 용도별로 파생한 키의 HMAC-SHA256입니다. 별도 환경 변수는 없습니다.
- **`NEXTAUTH_SECRET`을 바꾸면 기존 Claude 연결이 모두 끊깁니다.** Claude에서 커넥터를 다시 연결해야 합니다.
- 액세스 토큰은 요청마다 `mcp_grants` 행이 남아 있는지 확인하므로, 연결을 해제하면 만료를 기다리지 않고 즉시 막힙니다.
- 리프레시 토큰은 회전(rotation)하지 않습니다. 해제된 토큰으로 갱신하면 `invalid_grant`를 돌려줍니다.

### 검증 규칙

- **redirect URI 허용 목록**: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, 그리고 로컬 주소(`http://localhost`, `127.0.0.1`, `[::1]` — Claude Code 등)만 등록·사용할 수 있습니다. 그 외 주소는 등록 단계에서 `invalid_redirect_uri`로 거절합니다.
- 인가 요청의 `redirect_uri`는 등록한 값과 정확히 같아야 합니다 (로컬 주소는 포트만 달라도 허용).
- **PKCE S256 필수**. `plain`이나 challenge 없는 요청은 거절합니다.
- 검증에 실패한 인가 요청은 어디로도 리다이렉트하지 않고 동의 화면에 오류만 보여 줍니다.
- 토큰 교환 시 `client_id`, `redirect_uri`, `code_verifier`가 코드 발급 때와 모두 일치해야 합니다.

### 연결 해제

프로필 메뉴 › Claude 연동에서 연결 목록을 보고 해제할 수 있습니다 (`DELETE /api/me/connections/[id]`).  
해당 `mcp_grants` 행을 삭제하므로 액세스·리프레시 토큰이 모두 즉시 무효가 됩니다. 회원 탈퇴 시에도 함께 삭제됩니다.

## 보안 고려사항

- `NEXTAUTH_SECRET`은 반드시 `openssl rand -hex 32`로 생성한 값을 사용합니다.
- JWT는 서버에서만 디코드되며 클라이언트에 민감한 정보가 노출되지 않습니다.
- `dbUserId` 재검증으로 DB 초기화 이후 오래된 토큰의 권한 남용을 차단합니다.
- Claude 커넥터 동의 화면(`/oauth/authorize`)은 `X-Frame-Options: DENY`와 `frame-ancestors 'none'`으로 다른 사이트에 끼워 넣을 수 없게 합니다 (클릭재킹 방지).
- Claude 커넥터 토큰으로는 MCP 도구(러닝 기록 조회·추가, 훈련 계획 조회·저장·삭제, 신발·참가 대회 조회)만 쓸 수 있고, 회원 탈퇴 같은 다른 API는 호출할 수 없습니다.
