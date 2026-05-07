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
│   └── api/                    # Route Handlers (REST API)
│       ├── auth/[...nextauth]/ # NextAuth 핸들러
│       ├── marathons/          # 마라톤 목록 · 상세 · 동기화
│       ├── participations/     # 참가 신청 · 완주 기록
│       ├── records/            # 활동 기록 CRUD · TCX·CSV 임포트
│       ├── badges/             # 배지 조회 및 월간 km 자동 sync
│       ├── stats/              # 기간별 통계 · 개인 최고기록
│       └── me/                 # 내 프로필
│
├── src/
│   ├── views/                  # 페이지 수준 클라이언트 컴포넌트
│   │   ├── MarathonsPage.tsx
│   │   ├── ParticipationsPage.tsx
│   │   ├── ActivityPage.tsx
│   │   └── StatsPage.tsx
│   ├── components/             # 공유 UI 컴포넌트
│   │   ├── Nav.tsx
│   │   ├── Footer.tsx          # 하단 푸터 (소개·문의·약관 링크)
│   │   ├── Providers.tsx       # QueryClient + SessionProvider
│   │   ├── ConfirmModal.tsx
│   │   ├── Snackbar.tsx        # 우측 상단 토스트 알림
│   │   └── LoginModal.tsx      # 블러 오버레이 소셜 로그인 모달
│   ├── context/
│   │   └── UIContext.tsx       # 스낵바 · 확인 모달 · 로그인 모달 전역 상태
│   ├── lib/
│   │   ├── api.ts              # 클라이언트 fetch 래퍼
│   │   ├── auth.ts             # NextAuth 설정
│   │   ├── prisma.ts           # Prisma 싱글턴
│   │   ├── supabase.ts         # Supabase 클라이언트
│   │   ├── syncBadges.ts       # 월간 km 배지 sync 공유 로직
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
- `BadgeDefinition` 마스터 테이블 기준으로 `UserBadge` upsert

## 데이터 크롤링

`src/services/crawler.ts`가 `roadrun.co.kr`에서 EUC-KR HTML을 POST로 수신해 파싱합니다.  
`GET /api/marathons` 최초 호출 시 DB가 비어 있으면 자동으로 크롤링을 실행합니다.  
수동 동기화는 `POST /api/marathons/sync`로 트리거합니다.

## 환경 변수

| 키 | 설명 |
|----|------|
| `DATABASE_URL` | Supabase PostgreSQL Session pooler URL |
| `NEXTAUTH_SECRET` | JWT 서명 시크릿 |
| `NEXTAUTH_URL` | 배포 도메인 (예: `https://runmate.vercel.app`) |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth |
| `KAKAO_CLIENT_ID/SECRET` | Kakao OAuth |
| `NAVER_CLIENT_ID/SECRET` | Naver OAuth |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (클라이언트 스토리지용) |
