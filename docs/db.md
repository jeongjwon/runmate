# 데이터베이스

## 개요

PostgreSQL (Supabase 호스팅)을 사용하며 Prisma v5 ORM으로 관리합니다.  
스키마 파일 위치: `prisma/schema.prisma`

## 테이블 관계

```
users
  ├── marathon_participations (1:N)
  ├── activities              (1:N)
  ├── user_badges             (1:N)
  ├── notifications           (1:N)
  ├── shoes                   (1:N)
  ├── training_plans          (1:N)
  └── mcp_grants              (1:N)

marathons
  └── marathon_participations (1:N)

shoes
  └── activities              (1:N, activities.shoe_id — 신발을 지우면 NULL)

badge_definitions
  └── user_badges             (1:N)
```

## 테이블 상세

### `users`

사용자 계정. OAuth 제공자별로 `(provider, provider_id)` 복합 유니크 키를 사용합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |
| `deleted_at` | `timestamptz?` | soft delete |
| `provider` | `text` | `google` / `kakao` / `naver` |
| `provider_id` | `text` | 소셜 제공자가 발급한 사용자 ID |
| `name` | `text` | 표시 이름 |
| `email` | `text?` | 이메일 (선택) |
| `picture` | `text?` | 프로필 이미지 URL |

**유니크 제약**: `(provider, provider_id)`

---

### `marathons`

roadrun.co.kr에서 크롤링한 국내 마라톤 대회 목록입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |
| `name` | `text` | 대회명 |
| `date` | `text` | 개최 날짜 (YYYY-MM-DD) |
| `location` | `text` | 상세 장소 |
| `city` | `text` | 지역 (서울, 부산 등) |
| `categories` | `text` | 종목 쉼표 구분 (예: `5K,10K,Half,Full`) |
| `description` | `text` | 대회 설명 |
| `official_url` | `text` | 공식 홈페이지 URL |
| `entry_fee` | `int` | 참가비 (원) |
| `max_participants` | `int` | 최대 참가 인원 (0=무제한) |
| `is_active` | `bool` | 접수 중 여부 |

---

### `marathon_participations`

사용자가 참가 신청한 마라톤과 완주 기록입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 신청 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |
| `deleted_at` | `timestamptz?` | soft delete (참가 취소) |
| `user_id` | `int` FK → users | 신청한 사용자 |
| `marathon_id` | `int` FK → marathons | 대상 대회 |
| `category` | `text` | 신청 종목 (5K / 10K / Half / Full) |
| `finish_time` | `int?` | 완주 시간 (초 단위) |
| `race_notes` | `text?` | 완주 메모 |
| `certificate_url` | `text?` | 기록증 이미지 URL (Supabase Storage) |

**유니크 제약**: `(user_id, marathon_id)` — 동일 대회 중복 신청 불가  
**Soft delete**: `deleted_at`이 null인 레코드만 활성 참가로 취급

---

### `activities`

사용자의 개인 러닝 기록입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |
| `deleted_at` | `timestamptz?` | soft delete |
| `user_id` | `int?` FK → users | 기록 소유자 |
| `date` | `text` | 러닝 날짜 (YYYY-MM-DD) |
| `distance` | `float` | 거리 (km) |
| `duration` | `int` | 소요 시간 (초) |
| `pace` | `text` | 평균 페이스 문자열 (예: `6'01"`) |
| `pace_seconds` | `int` | 페이스 (초/km) — 인덱스 기반 최고기록 조회용 |
| `heart_rate` | `int` | 평균 심박수 (bpm) |
| `max_heart_rate` | `int` | 최고 심박수 (bpm), 없으면 0 |
| `calories` | `int` | 소모 칼로리 (kcal) |
| `route_type` | `text` | 코스 유형 (`road` / `trail` / `track` / `treadmill`) |
| `run_type` | `text` | 훈련 종류 (`easy` / `long` / `tempo` / `interval` / `race`), 미지정이면 빈 문자열 |
| `weather` | `text` | 날씨 (`sunny` / `cloudy` / `rainy` / `snowy` / `windy`) |
| `notes` | `text` | 메모 |
| `marathon_id` | `int?` | 연관 마라톤 ID |
| `shoe_id` | `int?` FK → shoes | 신은 신발. 신발을 삭제하면 NULL (`ON DELETE SET NULL`) |
| `route_data` | `text` | GPS 경로 JSON (`[[lat, lng], ...]`) |

**인덱스**:
- `(user_id, distance)` — 최장 거리 최고기록 조회
- `(user_id, duration)` — 최장 시간 최고기록 조회
- `(user_id, pace_seconds)` — 최고 페이스 최고기록 조회
- `(user_id, date)` — 날짜 범위 및 히트맵 조회
- `(shoe_id)` — 신발별 누적 거리 집계

---

### `shoes`

러닝화 목록입니다. 누적 거리는 컬럼으로 저장하지 않고, `start_km`에 해당 신발로 달린 `activities.distance` 합계를 더해 조회 시점에 계산합니다 (`src/lib/shoes.ts`의 `listShoes`).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |
| `user_id` | `int` FK → users | 소유자 (`ON DELETE CASCADE`) |
| `name` | `text` | 신발 이름 (최대 40자) |
| `start_km` | `float` | RunMate에 등록하기 전에 이미 달린 거리 (km, 기본값 0) |
| `retired_at` | `timestamptz?` | 은퇴 시각. 값이 있으면 기록 폼의 신발 선택에서 숨김 |

**인덱스**: `(user_id)` — 사용자별 신발 목록 조회  
교체 기준 거리는 `src/lib/utils.ts`의 `SHOE_LIMIT_KM`(600km)이며, 80% 이상이면 화면에 "교체 임박"으로 표시합니다.

---

### `training_plans`

날짜별 훈련 계획입니다. 하루에 계획은 하나이며, 같은 날짜에 다시 저장하면 덮어씁니다.  
활동 페이지의 계획 편집과 Claude 커넥터(`save_plans` 도구)가 같은 테이블을 씁니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `updated_at` | `timestamptz` | 수정 시각 |
| `user_id` | `int` FK → users | 소유자 (`ON DELETE CASCADE`) |
| `date` | `text` | 계획 날짜 (YYYY-MM-DD) |
| `kind` | `text` | 종류 (`run` / `strength` / `both` / `rest`) |
| `title` | `text` | 제목 (최대 100자, 예: `이지런 8km`) |
| `detail` | `text` | 상세 내용 (최대 500자) |
| `done` | `bool` | 완료 여부 (기본값 false) |

**유니크 제약**: `(user_id, date)` — 하루에 계획 하나

---

### `mcp_grants`

Claude 커넥터(MCP) 연결 이력입니다. 사용자가 동의 화면에서 "허용"을 누를 때마다 1행이 생기고, 연결을 해제하면 행을 삭제합니다.  
토큰 원문은 저장하지 않습니다. 자세한 흐름은 [auth.md](auth.md#claude-커넥터-oauth-mcp) 참고.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가. 액세스 토큰 안에 들어가는 연결 식별자 |
| `created_at` | `timestamptz` | 연결 시각 |
| `user_id` | `int` FK → users | 연결한 사용자 (`ON DELETE CASCADE`) |
| `client_name` | `text` | 연결한 클라이언트 이름 (예: `Claude`) |
| `code_id` | `text` UNIQUE | 인가 코드 식별자 — 같은 코드를 두 번 교환하지 못하게 함 |
| `refresh_hash` | `text` UNIQUE | 리프레시 토큰의 SHA-256 해시 |
| `last_used_at` | `timestamptz?` | 마지막 사용 시각 (10분에 한 번만 갱신) |

**인덱스**: `(user_id)` — 사용자별 연결 목록 조회

---

### `badge_definitions`

배지 종류 마스터 테이블. 초기 데이터는 `prisma/seed.ts`로 삽입합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `code` | `text` UNIQUE | 배지 식별자 (예: `monthly_50km`, `streak_7d`) |
| `type` | `text` | 배지 카테고리 (`monthly_km` / `streak` / `personal_best`) |
| `name` | `text` | 표시 이름 (예: `스타터`, `7일 연속`) |
| `description` | `text` | 설명 |
| `icon` | `text` | 이모지 아이콘 |
| `threshold` | `int` | 달성 기준값 (km 수, 일수 등) |
| `unit` | `text` | 단위 (`km`, `days`, 등) |

**초기 seed 데이터 (9개)**:

| code | type | name | threshold |
|------|------|------|-----------|
| `monthly_50km` | `monthly_km` | 스타터 | 50 |
| `monthly_100km` | `monthly_km` | 꾸준러 | 100 |
| `monthly_150km` | `monthly_km` | 챌린저 | 150 |
| `monthly_200km` | `monthly_km` | 마스터 | 200 |
| `streak_7d` | `streak` | 7일 연속 | 7 |
| `streak_30d` | `streak` | 한 달 연속 | 30 |
| `pb_distance` | `personal_best` | 최장거리 | 0 |
| `pb_pace` | `personal_best` | 최고페이스 | 0 |
| `pb_duration` | `personal_best` | 최장시간 | 0 |

---

### `user_badges`

사용자가 획득한 배지 이력입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `user_id` | `int` FK → users | 배지 소유자 |
| `badge_id` | `int` FK → badge_definitions | 획득한 배지 |
| `year` | `int?` | 월간 배지의 연도 (streak/PB는 null) |
| `month` | `int?` | 월간 배지의 월 (streak/PB는 null) |
| `awarded_at` | `timestamptz` | 배지 획득 시각 |

**유니크 제약**: `(user_id, badge_id, year, month)` — 동일 조건 중복 방지  
**인덱스**: `(user_id)` — 사용자별 배지 목록 조회

---

### `notifications`

사용자에게 전달되는 알림 이력입니다. D-day 알림과 배지 획득 알림을 저장합니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `int` PK | 자동 증가 |
| `created_at` | `timestamptz` | 생성 시각 |
| `user_id` | `int` FK → users | 알림 수신자 |
| `type` | `text` | 알림 유형 (`dday_7` / `dday_1` / `badge`) |
| `ref_id` | `text` | 알림 참조 식별자 (중복 방지용 복합 키 구성 요소) |
| `title` | `text` | 알림 제목 |
| `body` | `text` | 알림 본문 (기본값 빈 문자열) |
| `is_read` | `bool` | 읽음 여부 (기본값 false) |

**유니크 제약**: `(user_id, type, ref_id)` — 동일 조건 알림 중복 생성 방지  
**인덱스**: `(user_id, is_read)` — 미읽음 알림 카운트 조회  

`ref_id` 형식:
- D-day: `marathon:{id}:{date}` (예: `marathon:42:2026-04-20`)
- 배지: `badge:{code}:{year}:{month}` (예: `badge:monthly_100km:2026:4`)

## 마이그레이션

```bash
# 스키마 변경 후 DB 반영
npx prisma db push

# Prisma Client 재생성 (db push 시 자동 실행)
npx prisma generate

# 배지 초기 데이터 삽입
npm run db:seed

# 강제 초기화 (개발 환경, 데이터 삭제됨)
npx prisma db push --force-reset
```

## 연결 설정

Supabase Session Pooler URL을 사용합니다 (Transaction mode, port 6543).

```
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

`pgbouncer=true`와 `connection_limit=1`은 Prisma + PgBouncer 조합에서 필수 옵션입니다.

`prisma db push`는 `DIRECT_URL`로 접속합니다. 같은 풀러 주소의 Session mode(port 5432)를 사용합니다.

```
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Supabase의 직접 연결 주소(`db.[project-ref].supabase.co`)는 IPv6 전용이라, IPv6가 안 되는 네트워크에서는 `P1001: Can't reach database server`가 납니다.
