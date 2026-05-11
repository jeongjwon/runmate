# Entity Relationship Diagram

> GitHub / VS Code / JetBrains에서 Mermaid 다이어그램으로 렌더링됩니다.

## 관계 한눈에 보기

```
                        ┌─────────────────┐
                        │      users      │
                        │─────────────────│
                        │ PK id           │
                        │    provider     │
                        │    provider_id  │
                        │    name         │
                        │    email        │
                        │    picture      │
                        └────────┬────────┘
                                 │ 1
              ┌──────────────────┼──────────────────┬──────────────────┐
              │ N                │ N                │ N                │ N
              ▼                  ▼                  ▼                  ▼
┌─────────────────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
│marathon_participations│ │ activities │  │ user_badges  │  │  notifications   │
│─────────────────────│  │────────────│  │──────────────│  │──────────────────│
│ PK id               │  │ PK id      │  │ PK id        │  │ PK id            │
│ FK user_id    ──────┘  │ FK user_id─┘  │ FK user_id ──┘  │ FK user_id ──────┘
│ FK marathon_id        │ │    date    │  │ FK badge_id  │  │    type          │
│    category           │ │    distance│  │    year      │  │    ref_id        │
│    finish_time        │ │    duration│  │    month     │  │    title         │
│    deleted_at         │ │    pace    │  │    awarded_at│  │    is_read       │
└──────────┬────────────┘ │ pace_secs  │  └──────┬───────┘  └──────────────────┘
           │ N            │ route_data │         │ N
           │              └────────────┘         │
           │ 1                                   │ 1
  ┌────────┴────────┐                  ┌─────────┴────────┐
  │    marathons    │                  │ badge_definitions │
  │─────────────────│                  │──────────────────│
  │ PK id           │                  │ PK id            │
  │    name         │                  │ UK code          │
  │    date         │                  │    type          │
  │    location     │                  │    name          │
  │    city         │                  │    icon          │
  │    categories   │                  │    threshold     │
  │    is_active    │                  │    unit          │
  └─────────────────┘                  └──────────────────┘
```

---

## Mermaid ER Diagram

```mermaid
erDiagram
    users {
        int     id          PK
        string  provider
        string  provider_id
        string  name
        string  email
        string  picture
        datetime deleted_at  "soft delete"
    }

    marathons {
        int     id              PK
        string  name
        string  date
        string  location
        string  city
        string  categories      "쉼표 구분 (5K,10K,Half,Full)"
        boolean is_active
    }

    marathon_participations {
        int      id           PK
        int      user_id      FK
        int      marathon_id  FK
        string   category
        int      finish_time  "완주 시간(초), nullable"
        string   race_notes
        string   certificate_url
        datetime deleted_at   "soft delete (참가 취소)"
    }

    activities {
        int    id           PK
        int    user_id      FK
        string date
        float  distance     "km"
        int    duration     "초"
        string pace         "표시용 문자열 (5'30)"
        int    pace_seconds "정렬·비교용 숫자"
        int    heart_rate
        int    calories
        string route_type
        string route_data   "GPS JSON [[lat,lng],...]"
    }

    badge_definitions {
        int    id        PK
        string code      UK  "monthly_50km, streak_7d …"
        string type          "monthly_km | streak | personal_best"
        string name
        string icon
        int    threshold
        string unit
    }

    user_badges {
        int      id         PK
        int      user_id    FK
        int      badge_id   FK
        int      year       "월간 배지용, nullable"
        int      month      "월간 배지용, nullable"
        datetime awarded_at
    }

    notifications {
        int      id         PK
        int      user_id    FK
        string   type       "dday_7 | dday_1 | badge"
        string   ref_id     "marathon:{id}:{date} | badge:{code}:{y}:{m}"
        string   title
        string   body
        boolean  is_read
        datetime created_at
    }

    users                   ||--o{ marathon_participations : "참가 신청"
    marathons               ||--o{ marathon_participations : "대상 대회"
    users                   ||--o{ activities              : "러닝 기록"
    users                   ||--o{ user_badges             : "배지 획득"
    badge_definitions       ||--o{ user_badges             : "배지 정의"
    users                   ||--o{ notifications           : "알림 수신"
```

---

## 유니크 제약 & 인덱스 요약

| 테이블 | 유니크 제약 | 목적 |
|--------|------------|------|
| `users` | `(provider, provider_id)` | 동일 소셜 계정 중복 가입 방지 |
| `marathon_participations` | `(user_id, marathon_id)` | 동일 대회 중복 신청 방지 |
| `user_badges` | `(user_id, badge_id, year, month)` | 동일 조건 배지 중복 수여 방지 |
| `notifications` | `(user_id, type, ref_id)` | D-Day·배지 알림 중복 생성 방지 |

| 테이블 | 인덱스 | 목적 |
|--------|--------|------|
| `activities` | `(user_id, distance)` | 최장 거리 최고기록 조회 |
| `activities` | `(user_id, duration)` | 최장 시간 최고기록 조회 |
| `activities` | `(user_id, pace_seconds)` | 최고 페이스 최고기록 조회 |
| `activities` | `(user_id, date)` | 날짜 범위·히트맵 조회 |
| `user_badges` | `(user_id)` | 사용자별 배지 목록 조회 |
| `notifications` | `(user_id, is_read)` | 미읽음 알림 카운트 조회 |
