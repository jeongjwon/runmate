# DB 계획 및 개선 방향

## 현재 상태 요약

| 항목 | 현황 |
|------|------|
| DB | PostgreSQL (Supabase) |
| 인덱스 | Prisma 기본 PK·유니크 인덱스만 존재 |
| 마이그레이션 | `prisma db push` (스냅샷 방식) |
| Soft delete | `users`, `marathon_participations`, `activities` 적용 |
| 타임존 | UTC 저장, 클라이언트에서 로컬 변환 |

## 인덱스 추가 계획

현재 필터·정렬에 자주 사용되지만 인덱스가 없는 컬럼들입니다.

```prisma
model Marathon {
  @@index([date])           // 날짜순 정렬
  @@index([city])           // 지역 필터
  @@index([is_active])      // 접수중 필터
}

model Activity {
  @@index([user_id, date])  // 사용자별 날짜 범위 조회
  @@index([date])           // 기간별 통계
}

model MarathonParticipation {
  @@index([user_id, deleted_at])  // 내 마라톤 목록
}
```

## 스키마 개선 사항

### 1. `marathons.date` 타입 변경

현재 `String`으로 저장 중인 날짜를 `DateTime`으로 변경하면 날짜 연산과 인덱스 효율이 개선됩니다.

```prisma
// 현재
date String

// 개선안
date DateTime @db.Date
```

크롤러에서 날짜 파싱 로직 업데이트 필요합니다.

### 2. `activities.date` 타입 변경

`String` → `DateTime @db.Date`로 동일하게 변경합니다.  
기간별 통계 쿼리에서 문자열 비교 대신 날짜 함수를 사용할 수 있습니다.

### 3. `activities.marathon_id` 관계 명확화

현재 `marathon_id` 컬럼은 정의되어 있지만 FK 관계와 활용 로직이 미완성입니다.  
마라톤 완주 기록을 `activities`와 직접 연결하면 대회별 기록 조회가 용이해집니다.

```prisma
model Activity {
  marathonId Int?     @map("marathon_id")
  marathon   Marathon? @relation(fields: [marathonId], references: [id])
}
```

### 4. `users.deleted_at` 활용

현재 soft delete 컬럼은 있지만 조회 시 `deletedAt: null` 필터가 일부 누락되어 있습니다.  
모든 사용자 조회에 일관되게 적용해야 합니다.

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
데이터가 많아지면 DB 집계 쿼리로 전환이 필요합니다.

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
