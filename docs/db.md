# 데이터베이스

## 개요

PostgreSQL (Supabase 호스팅)을 사용하며 Prisma v5 ORM으로 관리합니다.  
스키마 파일 위치: `prisma/schema.prisma`

## 테이블 관계

```
users
  ├── marathon_participations (1:N)
  ├── activities              (1:N)
  └── user_badges             (1:N)

marathons
  └── marathon_participations (1:N)

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
| `calories` | `int` | 소모 칼로리 (kcal) |
| `route_type` | `text` | 코스 유형 (`road` / `trail` / `track` / `treadmill`) |
| `weather` | `text` | 날씨 (`sunny` / `cloudy` / `rainy` / `snowy` / `windy`) |
| `notes` | `text` | 메모 |
| `marathon_id` | `int?` | 연관 마라톤 ID |
| `route_data` | `text` | GPS 경로 JSON (`[[lat, lng], ...]`) |

**인덱스**:
- `(user_id, distance)` — 최장 거리 최고기록 조회
- `(user_id, duration)` — 최장 시간 최고기록 조회
- `(user_id, pace_seconds)` — 최고 페이스 최고기록 조회
- `(user_id, date)` — 날짜 범위 및 히트맵 조회

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
