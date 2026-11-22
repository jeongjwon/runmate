# Architecture

## 개요

RunMate는 Next.js 14 App Router 기반의 풀스택 웹 애플리케이션입니다. 서버 컴포넌트·클라이언트 컴포넌트·Route Handler를 단일 프로젝트 안에서 운용하며, 별도 백엔드 서버 없이 Next.js가 API 역할도 담당합니다.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript 5 |
| 인증 | NextAuth v4 (JWT 세션) |
| ORM | Prisma v5 |
| DB | PostgreSQL (Supabase) |
| 스토리지 | Supabase Storage |
| 클라이언트 상태 | TanStack Query v5 |
| 스타일 | Tailwind CSS v3 |
| 차트 | Chart.js + react-chartjs-2 |
| 지도 | Leaflet + react-leaflet (SSR 비활성화) |
| 파서 | iconv-lite (EUC-KR), fast-xml-parser (TCX) |
| 배포 | Vercel |

## 디렉토리 구조

```
runmate/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # 루트 레이아웃 (Providers, Nav, LoginModal 포함)
│   ├── page.tsx                # / → MarathonsPage
│   ├── globals.css             # 전역 CSS 변수 및 공통 컴포넌트
│   ├── activity/page.tsx       # 활동 기록 페이지
│   ├── participations/page.tsx # 내 마라톤 페이지
│   ├── stats/page.tsx          # 통계 페이지
│   ├── about/page.tsx          # 서비스 소개 (정적 서버 컴포넌트)
│   ├── contact/page.tsx        # 문의 · FAQ (정적 서버 컴포넌트)
│   ├── privacy/page.tsx        # 개인정보처리방침 (정적 서버 컴포넌트)
│   ├── terms/page.tsx          # 이용약관 (정적 서버 컴포넌트)
│   ├── oauth/authorize/page.tsx # Claude 커넥터 연결 동의 화면
│   └── api/                    # Route Handlers (REST API)
│       ├── auth/[...nextauth]/ # NextAuth 핸들러
│       ├── marathons/          # 마라톤 목록 · 상세 · 동기화
│       ├── participations/     # 참가 신청 · 완주 기록
│       ├── records/            # 활동 기록 CRUD · TCX·CSV 임포트
│       ├── badges/             # 배지 조회 및 월간 km 자동 sync
│       ├── notifications/      # 알림 목록 조회 · 읽음 처리
│       ├── stats/              # 기간별 통계 · 개인 최고기록 · 이번 달 km
│       ├── plans/              # 훈련 계획 조회 · 저장 · 삭제
│       ├── shoes/              # 신발 CRUD + 누적 거리
│       ├── me/                 # 내 프로필 · 회원 탈퇴 · Claude 연결 목록/해제
│       ├── mcp/                # Claude 커넥터용 MCP 엔드포인트 (JSON-RPC)
│       └── oauth/              # MCP용 OAuth (메타데이터 · 등록 · 인가 · 토큰)
│
├── src/
│   ├── views/                  # 페이지 수준 클라이언트 컴포넌트
│   │   ├── MarathonsPage.tsx
│   │   ├── ParticipationsPage.tsx
│   │   ├── ActivityPage.tsx
│   │   ├── StatsPage.tsx
│   │   └── McpAuthorizePage.tsx # Claude 연결 동의 화면 (로그인 · 허용/거부)
│   ├── components/             # 공유 UI 컴포넌트
│   │   ├── Nav.tsx
│   │   ├── TopBar.tsx          # 우측 상단바 (알림 벨 · 프로필 드롭다운)
│   │   ├── Footer.tsx          # 하단 푸터 (소개·문의·약관 링크)
│   │   ├── Providers.tsx       # QueryClient + SessionProvider
│   │   ├── ConfirmModal.tsx
│   │   ├── Snackbar.tsx        # 우측 상단 토스트 알림
│   │   ├── LoginModal.tsx      # 블러 오버레이 소셜 로그인 모달
│   │   ├── ActivityCalendar.tsx # 활동 페이지 월간 캘린더 + 선택한 날 패널
│   │   ├── RunTypePicker.tsx   # 훈련 종류 선택 버튼 (기록 폼 · TCX 결과 모달 공용)
│   │   ├── TcxImportModal.tsx  # TCX 업로드 결과 + 훈련 종류 · 신발 선택 모달
│   │   ├── WeekPlanCard.tsx    # 주간 훈련 계획 카드 (완료 체크)
│   │   ├── PlanEditModal.tsx   # 주간 훈련 계획 편집 모달
│   │   ├── ShoesCard.tsx       # 신발 목록 · 누적 거리 · 추가/수정 모달
│   │   └── ClaudeConnectModal.tsx # Claude 연동 안내 · 커넥터 주소 · 연결 해제
│   ├── context/
│   │   └── UIContext.tsx       # 스낵바 · 확인 모달 · 로그인 모달 전역 상태
│   ├── lib/
│   │   ├── api.ts              # 클라이언트 fetch 래퍼
│   │   ├── auth.ts             # NextAuth 설정
│   │   ├── prisma.ts           # Prisma 싱글턴
│   │   ├── supabase.ts         # Supabase 클라이언트
│   │   ├── syncBadges.ts       # 월간 km 배지 sync 공유 로직
│   │   ├── plans.ts            # 훈련 계획 검증 · 저장 (REST · MCP 공용)
│   │   ├── shoes.ts            # 신발 목록 + 누적 거리 계산, shoe_id 검증
│   │   ├── mcpAuth.ts          # MCP용 OAuth (클라이언트 등록 · 코드 · 토큰 서명/검증)
│   │   ├── mcpTools.ts         # MCP 도구 정의 · 실행
│   │   └── utils.ts            # 공통 유틸 (formatDuration, calcPace 등)
│   ├── services/
│   │   └── crawler.ts          # roadrun.co.kr EUC-KR 크롤러
│   └── types/
│       └── index.ts            # 공유 TypeScript 타입
│
├── prisma/
│   ├── schema.prisma           # DB 스키마
│   └── seed.ts                 # BadgeDefinition 초기 데이터 seed
└── docs/                       # 프로젝트 문서
```

## 요청 흐름

```
브라우저
  │
  ├─ 페이지 요청 ──────────────────────────────────────────
  │   Next.js Server Component (app/*/page.tsx)
  │     └─ 클라이언트 컴포넌트 렌더링 (src/views/*.tsx)
  │           └─ TanStack Query → fetch to /api/*
  │
  └─ API 요청 ─────────────────────────────────────────────
      Next.js Route Handler (app/api/*/route.ts)
        ├─ getServerSession()  ← NextAuth JWT 검증
        ├─ prisma.*()          ← PostgreSQL (Supabase)
        └─ NextResponse.json()
```

## 인증 흐름

1. 사용자가 Nav 또는 LoginModal에서 소셜 로그인 (Google / Kakao / Naver)
2. NextAuth `signIn` 콜백 → `users` 테이블 upsert
3. NextAuth `jwt` 콜백 → `token.dbUserId` 저장
4. 이후 요청마다 JWT 검증 → `session.user.id` 주입
5. Route Handler에서 `getServerSession(authOptions)`로 사용자 확인

로그인 UI는 `/login` 페이지 없이 전역 `LoginModal` 컴포넌트로 처리합니다.  
`UIContext`의 `openLogin()` / `closeLogin()`으로 모달 상태를 제어합니다.

## 배지 시스템

`src/lib/syncBadges.ts`의 `syncMonthlyKmBadges(userId)`가 핵심 로직입니다.

- 활동 기록 저장·수정·삭제 시 **자동 호출** (fire-and-forget, 응답 속도 무관)
- 통계 페이지 진입 시 `GET /api/badges`에서도 호출 (최신 상태 보장)
- `BadgeDefinition` 마스터 테이블 기준으로 `UserBadge` 생성 (신규 획득 시에만)
- 배지 신규 획득 시 `notifications` 테이블에 `type: 'badge'` 알림 자동 생성

## 알림 시스템

`GET /api/notifications` 호출 시 D-day 알림을 실시간 생성한 뒤 목록을 반환합니다.

- **D-7 / D-1 알림**: 참가 신청한 마라톤의 대회일 7일·1일 전에 자동 생성
- **배지 알림**: `syncMonthlyKmBadges` 에서 신규 배지 획득 시 생성
- 알림은 `(userId, type, refId)` 유니크 제약으로 중복 생성 방지
- `TopBar`에서 5분마다 폴링하며, 패널을 열면 전체 읽음 처리 (`PATCH /api/notifications`)

## 데이터 크롤링

`src/services/crawler.ts`가 `roadrun.co.kr`에서 EUC-KR HTML을 POST로 수신해 파싱합니다.  
`GET /api/marathons` 최초 호출 시 DB가 비어 있으면 자동으로 크롤링을 실행합니다.  
수동 동기화는 `POST /api/marathons/sync`로 트리거합니다.

## Claude 연동 (MCP)

Claude(웹·데스크톱·모바일)에 RunMate를 커스텀 커넥터로 추가하면, 대화에서 만든 훈련 계획과 러닝 기록이 RunMate DB에 바로 저장됩니다.

```
Claude ──(OAuth 2.1 + PKCE)──▶ /api/oauth/*  ──▶ mcp_grants
Claude ──(Bearer 토큰, JSON-RPC)──▶ /api/mcp ──▶ src/lib/mcpTools.ts ──▶ Prisma
                                                        │
활동 페이지 ◀── GET /api/plans · /api/records · /api/shoes ◀──┘ (같은 테이블)
```

- 커넥터 주소: `https://{도메인}/api/mcp` (프로필 메뉴 › Claude 연동에서 복사)
- 별도 MCP 서버나 SDK 없이 Route Handler 하나로 처리합니다. 세션 상태가 없어 Vercel 서버리스에서 그대로 동작합니다.
- 인가 서버도 RunMate 안에 있습니다. 추가 환경 변수 없이 `NEXTAUTH_SECRET`으로 토큰을 서명합니다. 자세한 내용은 [auth.md](auth.md#claude-커넥터-oauth-mcp).
- 도구 목록은 [data-layer.md](data-layer.md#claude-연동-mcp) 참고.
- Claude에서 저장한 내용은 활동 페이지를 열거나 탭으로 돌아올 때 반영됩니다 (실시간 푸시 없음).
- 배포 환경의 방화벽·봇 차단이 Anthropic 서버(`160.79.104.0/21`)의 `/api/mcp`, `/api/oauth/*`, `/.well-known/*` 요청을 막지 않아야 합니다.

## 환경 변수

| 키 | 설명 |
|----|------|
| `DATABASE_URL` | Supabase PostgreSQL Session pooler URL |
| `NEXTAUTH_SECRET` | JWT 서명 시크릿. Claude 커넥터 토큰 서명에도 사용 (바꾸면 Claude 연결이 끊김) |
| `NEXTAUTH_URL` | 배포 도메인 (예: `https://runmate.vercel.app`) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth |
| `KAKAO_CLIENT_ID/SECRET` | Kakao OAuth |
| `NAVER_CLIENT_ID/SECRET` | Naver OAuth |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (클라이언트 스토리지용) |
