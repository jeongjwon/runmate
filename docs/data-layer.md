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
  patch:  <T>(path: string, body: unknown)         => request('PATCH', path, body),
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
| POST | `/api/records` | 활동 기록 추가 + 배지 auto-sync (`shoe_id`로 신발 지정) | 필수 |
| PUT | `/api/records/[id]` | 활동 기록 수정 + 배지 auto-sync (날짜·거리가 바뀔 때만). `shoe_id: null`이면 신발 해제 | 필수 |
| DELETE | `/api/records/[id]` | 활동 기록 삭제 + 배지 auto-sync | 필수 |
| POST | `/api/records/import/csv` | CSV 임포트 (Garmin split / 범용) | 필수 |
| POST | `/api/records/import/tcx` | TCX 임포트 (GPS 경로·최고 심박 포함, 중복이면 건너뜀) | 필수 |
| GET | `/api/stats` | 기간별 통계 (`weekly/monthly/yearly`) | 필수 |
| GET | `/api/stats/personal-bests` | 최고기록 3종 (거리·시간·페이스) | 필수 |
| GET | `/api/stats/this-month` | 이번 달 러닝 거리 합계 (km) | 필수 |
| GET | `/api/badges` | 배지 목록 조회 + 월간 km 배지 sync | 필수 |
| GET | `/api/notifications` | 알림 목록 + D-day 알림 자동 생성 | 필수 |
| PATCH | `/api/notifications` | 알림 읽음 처리 (전체 또는 지정 ids) | 필수 |
| GET | `/api/plans` | 훈련 계획 목록 (`?from=&to=`, YYYY-MM-DD) | 필수 |
| PUT | `/api/plans/[date]` | 해당 날짜 계획 저장·덮어쓰기 (`kind`, `title`, `detail`) 또는 완료 표시 (`done`) | 필수 |
| DELETE | `/api/plans/[date]` | 해당 날짜 계획 삭제 | 필수 |
| GET | `/api/shoes` | 신발 목록 + 누적 거리·달린 횟수 | 필수 |
| POST | `/api/shoes` | 신발 추가 (`name`, `start_km`) | 필수 |
| PUT | `/api/shoes/[id]` | 신발 수정 (이름·시작 거리·은퇴) | 필수 |
| DELETE | `/api/shoes/[id]` | 신발 삭제 (기록은 남고 `shoe_id`만 NULL) | 필수 |
| GET | `/api/me` | 내 프로필 | 필수 |
| DELETE | `/api/me` | 회원 탈퇴 (사용자 데이터 전체 삭제) | 필수 |
| GET | `/api/me/connections` | Claude 연결 목록 | 필수 |
| DELETE | `/api/me/connections/[id]` | Claude 연결 해제 (해당 토큰 즉시 무효) | 필수 |
| POST | `/api/mcp` | Claude 커넥터용 MCP 엔드포인트 (JSON-RPC) | Bearer 토큰 |
| GET | `/api/oauth/protected-resource` | OAuth 리소스 메타데이터 (`/.well-known/oauth-protected-resource`로 rewrite) | 불필요 |
| GET | `/api/oauth/authorization-server` | OAuth 인가 서버 메타데이터 (`/.well-known/oauth-authorization-server`로 rewrite) | 불필요 |
| POST | `/api/oauth/register` | OAuth 클라이언트 동적 등록 (DCR) | 불필요 |
| POST | `/api/oauth/authorize` | 동의 화면의 허용/거부 처리 → 돌아갈 주소 반환 | 필수 |
| POST | `/api/oauth/token` | 인가 코드 → 토큰 교환, 리프레시 | 불필요 (PKCE) |

`/api/mcp`와 `/api/oauth/*`는 NextAuth 세션 쿠키가 아니라 자체 발급한 토큰으로 동작합니다. 흐름은 [auth.md](auth.md#claude-커넥터-oauth-mcp) 참고.

## 배지 Auto-sync

`src/lib/syncBadges.ts`의 `syncMonthlyKmBadges(userId)`는 활동 기록 변경 시마다 호출됩니다.

```ts
// records POST/PUT/DELETE 핸들러 내부
syncMonthlyKmBadges(session.user.id).catch(() => {})  // fire-and-forget
```

- `await` 없이 백그라운드에서 실행되어 API 응답 속도에 영향 없음
- `GET /api/badges`에서도 동일 함수를 호출해 최신 상태를 보장
- 신규 배지 획득 시 `notifications` 테이블에 `type: 'badge'` 알림을 함께 생성

## 알림 (Notifications)

`GET /api/notifications`는 두 단계로 동작합니다.

1. **D-day 알림 생성**: 활성 참가 대회의 대회일을 계산해 D-7·D-1 알림을 upsert (중복 없음)
2. **목록 반환**: 최신순 30개 + 미읽음 카운트

```ts
// TopBar.tsx
const { data: notifData } = useQuery({
  queryKey: ['notifications'],
  queryFn: () => api.get('/notifications'),
  enabled: !!user,
  refetchInterval: 5 * 60 * 1000,  // 5분 폴링
})

// 패널 열 때 전체 읽음 처리
const markReadMut = useMutation({
  mutationFn: (ids?: number[]) => api.patch('/notifications', ids ? { ids } : {}),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
})
```

## 회원 탈퇴

`DELETE /api/me`는 트랜잭션 안에서 사용자의 모든 데이터를 삭제합니다.

```ts
await prisma.$transaction(async (tx) => {
  await tx.notification.deleteMany({ where: { userId } })
  await tx.userBadge.deleteMany({ where: { userId } })
  await tx.activity.deleteMany({ where: { userId } })
  await tx.shoe.deleteMany({ where: { userId } })
  await tx.trainingPlan.deleteMany({ where: { userId } })
  await tx.mcpGrant.deleteMany({ where: { userId } })
  await tx.marathonParticipation.deleteMany({ where: { userId } })
  await tx.user.delete({ where: { id: userId } })
})
```

`mcp_grants`가 지워지므로 Claude에 연결해 둔 커넥터도 그 즉시 끊깁니다.  
삭제 후 클라이언트에서 `signOut({ callbackUrl: '/' })`을 호출합니다.

## 훈련 계획 (Plans)

하루에 계획 하나(`training_plans`의 `(user_id, date)` 유니크)이며, 저장은 항상 upsert입니다.  
검증과 저장 로직은 `src/lib/plans.ts`의 `savePlan`에 모여 있고, REST API(`PUT /api/plans/[date]`)와 MCP 도구(`save_plans`)가 같이 씁니다.  
입력이 잘못되면 `PlanInputError`를 던지며 REST에서는 400으로 바뀝니다.

```ts
// ActivityPage.tsx — 보이는 달의 첫 주 월요일 ~ 마지막 주 일요일
const { data: plansData } = useQuery({
  queryKey: ["plans", planFrom, planTo],
  queryFn: () => api.get(`/plans?from=${planFrom}&to=${planTo}`),
  staleTime: 0,                       // Claude에서 저장한 계획이 탭으로 돌아오면 바로 보이도록
  placeholderData: (prev) => prev,
});
```

- Claude에서 저장한 계획은 푸시로 오지 않습니다. 탭에 다시 포커스가 오거나 페이지를 열 때 다시 불러옵니다.
- 완료 체크(`PUT /api/plans/[date]` + `{ done }`)는 낙관적 업데이트로 처리합니다.

## 신발 (Shoes)

누적 거리는 저장하지 않고 조회할 때 계산합니다 (`src/lib/shoes.ts`의 `listShoes`).

```
km = start_km + (해당 신발로 달린 activities.distance 합계, soft delete 제외)
```

기록을 추가·수정·삭제하면 클라이언트가 `["shoes"]` 쿼리도 함께 무효화합니다.  
다른 사용자의 신발 id를 `shoe_id`로 보내면 `resolveShoeId`가 걸러 400을 돌려줍니다.

## Claude 연동 (MCP)

`POST /api/mcp`는 상태 없는(stateless) JSON-RPC 엔드포인트입니다. 세션을 만들지 않고 요청마다 JSON으로 응답하며, GET·DELETE는 405입니다.  
도구 정의와 실행은 `src/lib/mcpTools.ts`에 있습니다.

| 도구 | 동작 | 종류 |
|------|------|------|
| `get_overview` | 오늘 날짜, 이번 주 계획·거리, 최근 8주 주간 거리, 다가오는 대회, 신발 누적 거리 | 읽기 |
| `list_runs` | 기간 안의 러닝 기록 (기본 최근 30일) | 읽기 |
| `add_run` | 러닝 기록 1건 추가 (같은 날짜·거리·시간이면 새로 만들지 않음) | 쓰기 |
| `list_plans` | 기간 안의 훈련 계획 (기본 이번 주 월요일 ~ 다음 주 일요일) | 읽기 |
| `save_plans` | 계획 여러 날 저장 (한 번에 최대 62일, 같은 날짜는 덮어쓰기. 저장 전에 전부 검사해 하나라도 잘못되면 아무것도 저장하지 않음) | 쓰기 |
| `set_plan_done` | 계획 완료 여부 변경 | 쓰기 |
| `delete_plan` | 계획 삭제 | 쓰기 |

모든 도구는 토큰에서 얻은 `userId`로만 조회·저장하므로 다른 사용자의 데이터에는 접근할 수 없습니다.

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

- **최고 심박**: `Trackpoint`의 `HeartRateBpm` 최댓값을 `max_heart_rate`에 저장합니다. Trackpoint에 심박이 없으면 `Lap`의 `MaximumHeartRateBpm`을 사용합니다.
- **중복 방지**: 같은 사용자에게 날짜·시간(초)이 같고 거리가 ±0.005km 안인 기록이 이미 있으면 저장하지 않고 `200 { duplicate: true, data: 기존 기록 }`을 돌려줍니다. 새로 저장하면 `201`입니다.
- **여러 파일**: 요청 1번에 파일 1개만 받습니다. 활동 페이지에서 파일을 여러 개 고르면 클라이언트가 파일마다 순서대로 요청하고, 끝나면 결과 모달(`TcxImportModal`)에서 추가된 기록의 훈련 종류(`run_type`)와 신발(`shoe_id`)을 바로 고를 수 있습니다.
