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

## Phase 5 — 활동 캘린더용 컬럼 추가
**날짜**: 2026-11-22  
**변경**: `activities`에 컬럼 2개 추가 (기존 행은 기본값으로 채워짐)

### 변경 사항
- `run_type TEXT NOT NULL DEFAULT ''` — 훈련 종류 (`easy` / `long` / `tempo` / `interval` / `race`)
- `max_heart_rate INT NOT NULL DEFAULT 0` — 최고 심박수 (bpm)

---

## Phase 6 — 신발 · 훈련 계획 · Claude 연동 테이블 추가
**날짜**: 2026-11-22  
**변경**: 테이블 3개 추가, `activities`에 컬럼 1개 추가 (기존 데이터 변경 없음)

### 변경 사항
- 신규 테이블 추가:

**`shoes`**
```
id, created_at, updated_at, user_id, name, start_km, retired_at
idx(user_id)
FK user_id → users ON DELETE CASCADE
```

**`training_plans`**
```
id, created_at, updated_at, user_id, date, kind, title, detail, done
unique(user_id, date)
FK user_id → users ON DELETE CASCADE
```

**`mcp_grants`**
```
id, created_at, user_id, client_name, code_id(unique), refresh_hash(unique), last_used_at
idx(user_id)
FK user_id → users ON DELETE CASCADE
```

- `activities`에 `shoe_id INT NULL` 추가 — FK → `shoes` ON DELETE SET NULL, `idx(shoe_id)`

### 반영 방법
```bash
npm run db:push
```
새 테이블과 nullable 컬럼만 추가하므로 기존 행은 그대로입니다. 코드를 배포하기 전에 먼저 실행해야 합니다.

---

## Phase 7 — 대회 직접 추가 · 신발 정보 · 기록 중복 방지 컬럼
**날짜**: 2026-11-22  
**변경**: 컬럼 7개, 인덱스 1개, 유니크 제약 1개 추가 (테이블 추가 없음, 기존 데이터 변경 없음)

### 변경 사항
- `marathons.created_by INT NULL` — 대회를 직접 추가한 사용자. FK → `users` ON DELETE CASCADE, `idx(created_by)`. 크롤링한 대회는 NULL
- `marathon_participations.goal_time INT NULL` — 목표 기록 (초)
- `shoes.brand`, `shoes.model`, `shoes.purpose` — `TEXT NOT NULL DEFAULT ''`
- `activities.elapsed INT NULL` — 총 경과 시간 (초). 기존 `duration`은 이동 시간(정지 제외)으로 뜻을 정함
- `activities.external_id TEXT NULL` — 워치 활동 고유 ID (TCX의 `Activity/Id`)
- `unique(activities.user_id, activities.external_id)` — NULL은 여러 개 허용되므로 기존 행과 충돌하지 않음

### 반영 방법
앞의 다섯 컬럼은 `npm run db:push`로 반영했습니다.  
유니크 제약은 `db push`가 `--accept-data-loss`를 요구하며 멈추므로, 플래그를 쓰지 않고 바뀔 SQL을 확인한 뒤 그대로 실행했습니다.

```bash
# 1) 바뀔 SQL 미리 보기
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script

# 2) 추가만 하는 SQL인지 확인한 뒤 파일로 저장해 실행
npx prisma db execute --file phase7.sql --schema prisma/schema.prisma
npx prisma generate
```

```sql
ALTER TABLE "activities" ADD COLUMN "elapsed" INTEGER, ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "activities_user_id_external_id_key" ON "activities"("user_id", "external_id");
```

### 남은 데이터 정리
- 기존 기록의 `duration`에는 이동 시간과 총 경과 시간이 섞여 있습니다. 자동으로 구분할 수 없어 값은 그대로 두었고, Claude 커넥터의 `update_run` 또는 `import_runs`(`overwrite: true`)로 고칩니다.
- 이미 생긴 중복 기록은 `merge_runs`로 합칩니다.

---

## 현재 스키마 요약 (2026-11-22 기준)

| 테이블 | 주요 컬럼 | 비고 |
|--------|-----------|------|
| `users` | provider, provider_id, name, email, picture | unique(provider, provider_id) |
| `marathons` | name, date, location, city, categories, is_active, created_by | created_by가 있으면 그 사용자에게만 보이는 대회 |
| `marathon_participations` | user_id, marathon_id, finish_time, goal_time, category | unique(user_id, marathon_id), soft-delete |
| `activities` | user_id, date, distance, duration, elapsed, external_id, pace_seconds, run_type, max_heart_rate, shoe_id, route_data | 인덱스 5개, unique(user_id, external_id) |
| `shoes` | user_id, name, brand, model, purpose, start_km, retired_at | 누적 거리는 `activities` 합계로 계산 |
| `training_plans` | user_id, date, kind, title, detail, done | unique(user_id, date) — 하루에 계획 하나 |
| `mcp_grants` | user_id, client_name, code_id, refresh_hash, last_used_at | Claude 연결 1건당 1행, 토큰 원문은 저장하지 않음 |
| `badge_definitions` | code, type, threshold | 배지 종류 마스터 데이터 |
| `user_badges` | user_id, badge_id, year, month | unique으로 중복 수여 방지 |
| `notifications` | user_id, type, ref_id, is_read | unique으로 중복 생성 방지 |

## ref_id 컨벤션 (`notifications`)

| type | ref_id 형식 | 예시 |
|------|-------------|------|
| `dday_7`, `dday_1` | `marathon:{id}:{date}` | `marathon:42:2026-06-01` |
| `badge` | `badge:{code}:{year}:{month}` | `badge:monthly_100km:2026:5` |
