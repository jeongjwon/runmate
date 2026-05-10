# DB 계획 및 개선 방향

## 현재 상태 요약

| 항목 | 현황 |
|------|------|
| DB | PostgreSQL (Supabase) |
| 인덱스 | PK·유니크 + activities 4개 복합 인덱스 적용 완료 |
| 마이그레이션 | `prisma db push` (스냅샷 방식) |
| Soft delete | `users`, `marathon_participations`, `activities` 적용 |
| 타임존 | UTC 저장, 클라이언트에서 로컬 변환 |
| 배지 시스템 | `badge_definitions` + `user_badges` 두 테이블 구조로 운영 중 |
| 알림 시스템 | `notifications` 테이블 추가 — D-day·배지 알림 저장 |

## 적용된 인덱스

`activities` 테이블에 최고기록 조회 및 히트맵 성능을 위한 인덱스가 추가되었습니다.

```prisma
model Activity {
  @@index([userId, distance])    // 최장 거리 최고기록
  @@index([userId, duration])    // 최장 시간 최고기록
  @@index([userId, paceSeconds]) // 최고 페이스 최고기록
  @@index([userId, date])        // 날짜 범위 조회 (히트맵, 통계)
}
```

추가 권장 인덱스 (미적용):

```prisma
model Marathon {
  @@index([date])       // 날짜순 정렬
  @@index([city])       // 지역 필터
  @@index([isActive])   // 접수중 필터
}

model MarathonParticipation {
  @@index([userId, deletedAt])  // 내 마라톤 목록
}
```

## 스키마 개선 사항

### 1. `marathons.date` 타입 변경 (미적용)

현재 `String`으로 저장 중인 날짜를 `DateTime`으로 변경하면 날짜 연산과 인덱스 효율이 개선됩니다.

```prisma
// 현재
date String

// 개선안
date DateTime @db.Date
```

크롤러에서 날짜 파싱 로직 업데이트가 필요합니다.

### 2. `activities.date` 타입 변경 (미적용)

`String` → `DateTime @db.Date`로 동일하게 변경합니다.  
기간별 통계 쿼리에서 문자열 비교 대신 날짜 함수를 사용할 수 있습니다.

### 3. `activities.marathon_id` 관계 명확화 (미적용)

현재 `marathon_id` 컬럼은 정의되어 있지만 FK 관계와 활용 로직이 미완성입니다.  
마라톤 완주 기록을 `activities`와 직접 연결하면 대회별 기록 조회가 용이해집니다.

### 4. 배지 시스템 확장 계획

현재 `monthly_km` 타입이 자동 sync되며, 신규 배지 획득 시 알림이 함께 생성됩니다. 향후 추가 예정:

| type | 설명 | sync 시점 |
|------|------|-----------|
| `streak` | 연속 달리기 배지 | 기록 저장 시 |
| `personal_best` | 최고기록 갱신 배지 | 기록 저장 시 |

배지 종류는 `badge_definitions` 테이블에 row 추가만 하면 확장됩니다.  
`prisma/seed.ts`에 정의를 추가한 뒤 `npm run db:seed`를 재실행합니다.

### 5. 알림 테이블 정리 정책 (미적용)

`notifications` 테이블은 현재 삭제 정책이 없습니다. 데이터가 누적될 경우 30일 이상 된 읽음 알림을 정기 삭제하는 정리 Job 추가를 권장합니다.

## 마이그레이션 전략 전환

현재 `prisma db push`는 스키마 변경을 즉시 DB에 반영하지만 마이그레이션 히스토리를 남기지 않습니다.  
프로덕션 서비스가 안정화되면 `prisma migrate dev` 방식으로 전환을 권장합니다.

```bash
# 마이그레이션 파일 생성
npx prisma migrate dev --name add_date_indexes

# 프로덕션 배포
npx prisma migrate deploy
```

## 통계 쿼리 최적화

현재 `/api/stats`는 모든 `activities`를 가져와 애플리케이션 레벨에서 집계합니다.  
`/api/stats/personal-bests`는 인덱스를 활용한 DB 레벨 조회로 구현되어 있습니다.  
데이터가 많아지면 월별 통계도 DB 집계 쿼리로 전환이 필요합니다.

```sql
-- 월별 통계 예시
SELECT
  DATE_TRUNC('month', date::date) AS month,
  COUNT(*) AS run_count,
  SUM(distance) AS total_distance,
  SUM(duration) AS total_duration
FROM activities
WHERE user_id = $1 AND deleted_at IS NULL
GROUP BY 1
ORDER BY 1;
```

## Supabase Storage 구조

```
certificates/
  └── {userId}/
        └── {participationId}_{timestamp}.{ext}
```

현재 파일명 충돌 방지 로직이 없어 동일 `participationId`로 재업로드 시 덮어씁니다.  
의도한 동작이므로 유지합니다.

## 백업 정책

Supabase 무료 티어는 7일 PITR을 제공합니다.  
중요한 스키마 변경 전에는 수동 백업을 권장합니다.

```bash
pg_dump {DATABASE_URL} > backup_$(date +%Y%m%d).sql
```
