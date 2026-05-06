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

## 보안 고려사항

- `NEXTAUTH_SECRET`은 반드시 `openssl rand -hex 32`로 생성한 값을 사용합니다.
- JWT는 서버에서만 디코드되며 클라이언트에 민감한 정보가 노출되지 않습니다.
- `dbUserId` 재검증으로 DB 초기화 이후 오래된 토큰의 권한 남용을 차단합니다.
