# RunMate

한국 마라톤 일정 조회, 참가 신청, 러닝 기록 관리를 위한 웹 애플리케이션.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 서버 언어 | TypeScript (Node.js 20+) |
| 서버 프레임워크 | Express v4 |
| ORM | Prisma v5 + SQLite (`runmate.db`) |
| 인증 | Passport.js (Google / Kakao / Naver OAuth) |
| 클라이언트 | React 18 + TypeScript + Vite |
| 상태 관리 | TanStack Query v5 |
| 라우팅 | React Router v6 |
| CSS | Tailwind CSS v3 |
| 차트 | Chart.js + react-chartjs-2 |
| 지도 | Leaflet + react-leaflet |

## 디렉토리 구조

```
runmate/
├── package.json          # 루트 (concurrently 개발 서버)
├── runmate.db            # SQLite DB
├── static/               # 업로드 파일
│
├── server/               # Express + Prisma (port 4000)
│   ├── .env
│   ├── .env.example
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts
│       ├── auth.ts
│       ├── db.ts
│       ├── middleware/requireAuth.ts
│       ├── routes/       # auth, marathons, participations, records, stats
│       └── services/
│           └── crawler.ts  # roadrun.co.kr EUC-KR 크롤러
│
└── client/               # React + Vite (port 5173)
    ├── public/favicon.png
    └── src/
        ├── main.tsx, App.tsx, index.css
        ├── types/, lib/, context/, components/
        └── pages/        # MarathonsPage, ParticipationsPage, ActivityPage, LoginPage
```

## 실행 방법

```bash
# 1. 의존성 설치 (최초 1회)
npm install && npm run install:all

# 2. 환경변수
cp server/.env.example server/.env
# server/.env 편집

# 3. DB 초기화 (최초 1회)
cd server && npx prisma generate && npx prisma db push && cd ..

# 4. 개발 서버 실행
npm run dev
```

## 환경변수 (`server/.env`)

| 키 | 설명 |
|----|------|
| `DATABASE_URL` | `file:../../runmate.db` ← schema.prisma 기준 상대경로 |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console |
| `KAKAO_CLIENT_ID/SECRET` | Kakao Developers |
| `NAVER_CLIENT_ID/SECRET` | Naver Developers |
| `FRONTEND_URL` | `http://localhost:5173` |

> **중요**: `DATABASE_URL`은 `server/prisma/schema.prisma` 위치 기준.  
> `file:../../runmate.db` → `server/prisma/` 에서 두 단계 위 → 루트 `runmate.db`

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

## 주요 주의사항

**Prisma SQLite 상대경로**  
`DATABASE_URL`의 `file:` 경로는 `schema.prisma` 위치 기준.  
`server/prisma/schema.prisma` → `../../runmate.db` = 루트 `runmate.db`.  
`../runmate.db`로 쓰면 `server/runmate.db`(빈 파일)를 바라본다.

**마라톤 데이터 동기화**  
```bash
curl -X POST http://localhost:4000/api/marathons/sync
```
roadrun.co.kr에서 EUC-KR HTML 가져와 파싱 후 DB upsert.
