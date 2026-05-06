# 데이터 레이어

## 구조 개요

```
클라이언트 컴포넌트
  └─ TanStack Query (useQuery / useMutation)
       └─ src/lib/api.ts  (fetch 래퍼)
            └─ Next.js Route Handler  (app/api/*/route.ts)
                 └─ Prisma Client
                      └─ PostgreSQL (Supabase)
```

## 서버: Prisma Client

### 싱글턴 패턴

개발 환경에서 Hot Reload 시 Prisma Client 인스턴스가 중복 생성되는 것을 방지합니다.

```ts
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }
const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
export default prisma
```

### 쿼리 패턴

**단순 조회**
```ts
const marathon = await prisma.marathon.findUnique({ where: { id } })
```

**필터 + 정렬**
```ts
const marathons = await prisma.marathon.findMany({
  where: {
    ...(city     ? { city:       { contains: city } }     : {}),
    ...(category ? { categories: { contains: category } } : {}),
  },
  orderBy: { date: 'asc' },
})
```

**Soft delete 패턴** — `deletedAt: null` 조건으로 활성 레코드만 조회합니다.
```ts
const participations = await prisma.marathonParticipation.findMany({
  where: { userId, deletedAt: null },
})
```

**Upsert** — 배지 sync 및 크롤링 동기화에서 사용합니다.
```ts
await prisma.userBadge.upsert({
  where: { userId_badgeId_year_month: { userId, badgeId, year, month } },
  update: {},
  create: { userId, badgeId, year, month },
})
```

**인덱스 활용 최고기록 조회**
```ts
const [bestDistance, bestDuration, bestPace] = await Promise.all([
  prisma.activity.findFirst({ where: { userId, deletedAt: null }, orderBy: { distance: 'desc' } }),
  prisma.activity.findFirst({ where: { userId, deletedAt: null }, orderBy: { duration: 'desc' } }),
  prisma.activity.findFirst({ where: { userId, deletedAt: null, paceSeconds: { gt: 0 } }, orderBy: { paceSeconds: 'asc' } }),
])
```

## 클라이언트: TanStack Query

### 설정

```ts
// src/components/Providers.tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 } },
})
```

### useQuery 패턴

```ts
const { data, isLoading } = useQuery<MarathonsResponse>({
  queryKey: ['marathons', city, cat],   // 필터가 바뀌면 자동 재요청
  queryFn: () => api.get(`/marathons?city=${city}&category=${cat}`),
})
```

### useMutation + 캐시 무효화

```ts
const addMut = useMutation({
  mutationFn: (id: number) => api.post(`/participations/${id}`, {}),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['marathons'] })
    qc.invalidateQueries({ queryKey: ['participations'] })
  },
})
```

## 클라이언트: API 래퍼

`src/lib/api.ts`는 Base URL(`/api`) 접두사, `credentials: 'include'`, 에러 변환을 처리합니다.

```ts
export const api = {
  get:    <T>(path: string): Promise<T>            => request('GET', path),
  post:   <T>(path: string, body: unknown)         => request('POST', path, body),
  put:    <T>(path: string, body: unknown)         => request('PUT',  path, body),
  delete: <T>(path: string): Promise<T>            => request('DELETE', path),
  upload: async <T>(path: string, form: FormData)  => { /* multipart/form-data */ },
}
```

에러 응답은 `{ error: string }` 형태이며, `throw new Error(data.error)`로 상위에 전파됩니다.

## API Route Handler 목록

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/marathons` | 마라톤 목록 (city·category 필터, 빈 DB 시 자동 크롤링) | 선택 |
| POST | `/api/marathons/sync` | roadrun.co.kr 크롤링 동기화 | 불필요 |
| GET | `/api/marathons/[id]` | 마라톤 상세 | 불필요 |
| GET | `/api/participations` | 내 참가 목록 | 필수 |
| POST | `/api/participations/[marathon_id]` | 참가 신청 | 필수 |
| DELETE | `/api/participations/[marathon_id]` | 참가 취소 | 필수 |
| PUT | `/api/participations/[marathon_id]/record` | 완주 기록 저장 | 필수 |
| GET | `/api/records` | 활동 기록 목록 | 필수 |
| POST | `/api/records` | 활동 기록 추가 + 배지 auto-sync | 필수 |
| PUT | `/api/records/[id]` | 활동 기록 수정 + 배지 auto-sync | 필수 |
| DELETE | `/api/records/[id]` | 활동 기록 삭제 + 배지 auto-sync | 필수 |
| POST | `/api/records/import/csv` | CSV 임포트 (Garmin split / 범용) | 필수 |
| POST | `/api/records/import/tcx` | TCX 임포트 (GPS 경로 포함) | 필수 |
| GET | `/api/stats` | 기간별 통계 (`weekly/monthly/yearly`) | 필수 |
| GET | `/api/stats/personal-bests` | 최고기록 3종 (거리·시간·페이스) | 필수 |
| GET | `/api/badges` | 배지 목록 조회 + 월간 km 배지 sync | 필수 |
| GET | `/api/me` | 내 프로필 | 필수 |

## 배지 Auto-sync

`src/lib/syncBadges.ts`의 `syncMonthlyKmBadges(userId)`는 활동 기록 변경 시마다 호출됩니다.

```ts
// records POST/PUT/DELETE 핸들러 내부
syncMonthlyKmBadges(session.user.id).catch(() => {})  // fire-and-forget
```

- `await` 없이 백그라운드에서 실행되어 API 응답 속도에 영향 없음
- `GET /api/badges`에서도 동일 함수를 호출해 최신 상태를 보장

## 파일 업로드 — Supabase Storage

기록증 이미지는 Supabase Storage `certificates` 버킷에 업로드합니다.

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// 업로드
const { data, error } = await supabase.storage
  .from('certificates')
  .upload(`${userId}/${filename}`, file)
const publicUrl = supabase.storage.from('certificates').getPublicUrl(path).data.publicUrl
```

버킷 RLS 정책에서 authenticated 사용자만 업로드 가능하도록 설정해야 합니다.

## 데이터 임포트

### CSV (Garmin Split 포맷)

파일명 `도시명러닝YYYYMMDDHHMMSS.csv`에서 날짜를 추출합니다.  
`Summary` 행의 `GetDistance`, `Time`, `Avg HR`, `Calories`를 집계값으로 사용합니다.  
범용 포맷도 지원합니다 (`date,distance,duration,...`).

### TCX (GPS 경로)

`fast-xml-parser`로 파싱 후 `Trackpoint` 배열에서 위경도를 추출합니다.  
`routeData` 컬럼에 `[[lat, lng], ...]` JSON 문자열로 저장하며, 활동 상세 드로어에서 Leaflet 지도로 시각화합니다.
