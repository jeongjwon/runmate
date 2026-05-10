# RunMate

한국 마라톤 일정 조회, 참가 신청, 러닝 기록 관리를 위한 웹 애플리케이션.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router), TypeScript |
| ORM | Prisma v5 |
| DB | PostgreSQL (Supabase) |
| 인증 | NextAuth.js v4 (Google / Kakao / Naver OAuth, JWT) |
| 상태 관리 | TanStack Query v5 |
| CSS | Tailwind CSS v3 |
| 차트 | Chart.js + react-chartjs-2 |
| 지도 | Leaflet + react-leaflet |
| 데이터 파싱 | fast-xml-parser (TCX), iconv-lite (EUC-KR 크롤링) |

## 디렉토리 구조

```
runmate/
├── package.json
├── next.config.js
├── prisma/
│   ├── schema.prisma         # Prisma 스키마 (PostgreSQL)
│   └── seed.ts
├── public/                   # 정적 파일
├── static/                   # 업로드 파일
│
├── app/                      # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx              # 마라톤 목록 (메인)
│   ├── activity/             # 러닝 기록
│   ├── participations/       # 내 마라톤
│   ├── stats/                # 통계 & 배지
│   ├── about/, contact/, privacy/, terms/
│   └── api/                  # Route Handlers
│       ├── auth/[...nextauth]/
│       ├── marathons/        # 목록, sync(크롤링)
│       ├── participations/
│       ├── records/          # 러닝 기록 CRUD + TCX import
│       ├── stats/
│       ├── badges/
│       ├── notifications/
│       └── me/
│
└── src/                      # 공통 모듈
    ├── components/
    ├── context/
    ├── lib/                  # Prisma client, auth 설정
    ├── services/
    │   └── crawler.ts        # roadrun.co.kr EUC-KR 크롤러
    ├── types/
    └── views/                # 페이지 컴포넌트
```

## 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.local.example .env.local
# .env.local 편집

# 3. DB 초기화 (최초 1회)
npx prisma generate && npx prisma db push

# 4. 개발 서버 실행
npm run dev
```

## 환경변수 (`.env.local`)

| 키 | 설명 |
|----|------|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console |
| `KAKAO_CLIENT_ID/SECRET` | Kakao Developers |
| `NAVER_CLIENT_ID/SECRET` | Naver Developers |

## API 엔드포인트

| 메서드 | URL | 설명 |
|--------|-----|------|
| GET | `/api/marathons` | 목록 (`?city=&category=`) |
| POST | `/api/marathons/sync` | roadrun.co.kr 크롤링 |
| GET | `/api/participations` | 내 마라톤 (인증 필요) |
| POST/DELETE | `/api/participations/:marathon_id` | 추가/제거 |
| PUT | `/api/participations/:marathon_id/record` | 완주 기록 |
| GET/POST | `/api/records` | 러닝 기록 |
| PUT/DELETE | `/api/records/:id` | 수정/삭제 |
| POST | `/api/records/import/tcx` | TCX 임포트 |
| GET | `/api/stats?period=weekly\|monthly\|yearly` | 통계 |
| GET | `/api/badges` | 배지 목록 |
| GET/PATCH | `/api/notifications` | 알림 목록 / 읽음 처리 |
| GET/DELETE | `/api/me` | 내 정보 / 회원 탈퇴 |

## 주요 주의사항

**DB 스키마 변경 시**
`prisma db push`로 직접 반영 (migration 파일 없음).
스키마 이력은 `database/` 폴더 참고.

**마라톤 데이터 동기화**
```bash
curl -X POST http://localhost:3000/api/marathons/sync
```
roadrun.co.kr에서 EUC-KR HTML 가져와 파싱 후 DB upsert.
첫 페이지 로드 시 DB가 비어있으면 자동 sync 실행됨.

**인증 흐름**
NextAuth.js JWT 전략 사용. 세션은 쿠키 기반이며 `getServerSession()`으로 서버 컴포넌트/Route Handler에서 접근.
