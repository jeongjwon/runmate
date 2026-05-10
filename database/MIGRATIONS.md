# Database Migration History

RunMate는 `prisma db push` 방식을 사용하므로 공식 migration 파일이 없습니다.
이 문서는 git 커밋 기준으로 DB 스키마의 변화를 수동으로 기록합니다.

---

## Phase 1 — Go + SQLite (초기)
**커밋**: `694d9da` (2026-04-21)  
**DB**: SQLite (로컬 파일)  
**ORM**: GORM (Go)

### 테이블
- `users` — provider, provider_id, name, email, picture
- `marathons` — name, date, location, categories, description
- `marathon_participations` — user_id, marathon_id, finish_time, notes
- `records` — user_id, date, distance, duration, pace, heart_rate, calories

---

## Phase 2 — Express + SQLite
**커밋**: `c2805e0` (2026-05-05)  
**변경**: Go+Gin → Node.js+Express+Prisma, SQLite 유지  
**ORM**: Prisma v5 (provider: sqlite)

### 변경 사항
- `records` → `activities` 로 테이블명 변경 (커밋 `533836e`)
- `activities`에 컬럼 추가: `route_data TEXT`, `pace_seconds INT`, `route_type`, `weather`, `marathon_id`
- `marathons`에 컬럼 추가: `city`, `official_url`, `entry_fee`, `max_participants`, `is_active`
- soft-delete 패턴 도입: `deleted_at` 컬럼 (`users`, `marathon_participations`, `activities`)

---

## Phase 3 — Express + PostgreSQL (Supabase)
**커밋**: `a55ca41` (2026-05-05)  
**변경**: SQLite → PostgreSQL (Supabase)  
**ORM**: Prisma v5 (provider: postgresql)

### 변경 사항
- `schema.prisma`의 `provider = "sqlite"` → `"postgresql"`
- `DATABASE_URL`이 Supabase 연결 문자열로 교체
- 파일 기반 DB(`runmate.db`) → 클라우드 DB

---

## Phase 4 — Next.js 14 + PostgreSQL (현재)
**커밋**: `da7352c` (2026-05-06)  
**변경**: Express+React(Vite) 모노레포 → Next.js 14 단일 앱  
**인증**: Passport.js → NextAuth.js v4 (JWT 전략)

### 변경 사항
- `schema.prisma` 위치: `server/prisma/` → 루트 `prisma/`
- 신규 테이블 추가:

**`badge_definitions`**
```
id, code(unique), type, name, description, icon, threshold, unit
```

**`user_badges`**
```
id, user_id, badge_id, year, month, awarded_at
unique(user_id, badge_id, year, month)
```

**`notifications`**
```
id, user_id, type, ref_id, title, body, is_read, created_at
unique(user_id, type, ref_id)
```

### 인덱스 추가 (`activities`)
```
idx(user_id, distance)
idx(user_id, duration)
idx(user_id, pace_seconds)
idx(user_id, date)
```

---

## 현재 스키마 요약 (2026-05-10 기준)

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| `users` | provider, provider_id, name, email, picture | unique(provider, provider_id) |
| `marathons` | name, date, location, city, categories, is_active | — |
| `marathon_participations` | user_id, marathon_id, finish_time, category | unique(user_id, marathon_id), soft-delete |
| `activities` | user_id, date, distance, duration, pace_seconds, route_data | 인덱스 4개 |
| `badge_definitions` | code, type, threshold | 배지 종류 마스터 데이터 |
| `user_badges` | user_id, badge_id, year, month | unique으로 중복 수여 방지 |
| `notifications` | user_id, type, ref_id, is_read | unique으로 중복 생성 방지 |

## ref_id 컨벤션 (`notifications`)

| type | ref_id 형식 | 예시 |
|------|-------------|------|
| `dday_7`, `dday_1` | `marathon:{id}:{date}` | `marathon:42:2026-06-01` |
| `badge` | `badge:{code}:{year}:{month}` | `badge:monthly_100km:2026:5` |
