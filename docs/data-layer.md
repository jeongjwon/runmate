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
| GET | `/api/marathons` | 마라톤 목록 (city·category 필터, 빈 DB 시 자동 크롤링). 크롤링한 대회 + 내가 직접 추가한 대회만 | 선택 |
| POST | `/api/marathons` | 대회 직접 추가 (`name`, `date`, `category`, `location`, `official_url`). 본인에게만 보이고 내 마라톤에 바로 들어감. 같은 날짜·이름이 이미 있으면 409 | 필수 |
| POST | `/api/marathons/sync` | roadrun.co.kr 크롤링 동기화 (직접 추가한 대회는 건드리지 않음) | 불필요 |
| GET | `/api/marathons/[id]` | 마라톤 상세 (다른 사용자가 직접 추가한 대회는 404) | 불필요 |
| PUT | `/api/marathons/[id]` | 직접 추가한 대회 수정 (본인만) | 필수 |
| DELETE | `/api/marathons/[id]` | 직접 추가한 대회 삭제 (본인만, 참가 정보·완주 기록도 함께 삭제) | 필수 |
| GET | `/api/participations` | 내 참가 목록 | 필수 |
| POST | `/api/participations/[marathon_id]` | 참가 신청 | 필수 |
| DELETE | `/api/participations/[marathon_id]` | 참가 취소. 경로의 값은 항상 대회 id (참가 id 아님) | 필수 |
| PUT | `/api/participations/[marathon_id]/record` | 완주 기록 · 목표 기록(`goal_time`) 저장 | 필수 |
| GET | `/api/records` | 활동 기록 목록 | 필수 |
| POST | `/api/records` | 활동 기록 추가 + 배지 auto-sync (`shoe_id`로 신발 지정) | 필수 |
| PUT | `/api/records/[id]` | 활동 기록 수정 + 배지 auto-sync (날짜·거리가 바뀔 때만). `shoe_id: null`이면 신발 해제 | 필수 |
| DELETE | `/api/records/[id]` | 활동 기록 삭제 + 배지 auto-sync | 필수 |
| POST | `/api/records/import/csv` | CSV 임포트 (Garmin split / 범용) | 필수 |
| POST | `/api/records/import/tcx` | TCX 임포트 (GPS 경로·최고 심박·`external_id`·총 경과 시간 포함. 중복이면 새로 만들지 않고 빠진 정보만 채움) | 필수 |
| GET | `/api/stats` | 기간별 통계 (`weekly/monthly/yearly`, 주·월 경계는 한국 날짜 기준) | 필수 |
| GET | `/api/stats/personal-bests` | 최고기록 3종 (거리·시간·페이스) | 필수 |
| GET | `/api/stats/this-month` | 이번 달 러닝 거리 합계 (km) | 필수 |
| GET | `/api/badges` | 배지 목록 조회 + 월간 km 배지 sync | 필수 |
| GET | `/api/notifications` | 알림 목록 + D-day 알림 자동 생성 | 필수 |
| PATCH | `/api/notifications` | 알림 읽음 처리 (전체 또는 지정 ids) | 필수 |
| GET | `/api/plans` | 훈련 계획 목록 (`?from=&to=`, YYYY-MM-DD) | 필수 |
| PUT | `/api/plans/[date]` | 해당 날짜 계획 저장·덮어쓰기 (`kind`, `title`, `detail`) 또는 완료 표시 (`done`) | 필수 |
| DELETE | `/api/plans/[date]` | 해당 날짜 계획 삭제 | 필수 |
| GET | `/api/shoes` | 신발 목록 + 누적 거리·달린 횟수 | 필수 |
| POST | `/api/shoes` | 신발 추가 (`name`, `start_km`, `brand`, `model`, `purpose`). 같은 이름이 있으면 409 | 필수 |
| PUT | `/api/shoes/[id]` | 신발 수정 (이름·브랜드·모델·용도·시작 거리·은퇴) | 필수 |
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

// 읽음 처리: 캐시를 먼저 바꾸고 서버에는 뒤따라 저장 (실패하면 다시 조회해 되돌림)
const markReadMut = useMutation({
  mutationFn: () => api.patch('/notifications', {}),
  onError: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
})
```

- 패널을 열면 배지(미읽음 수)는 즉시 0이 되고, 어떤 알림이 새것인지 알 수 있도록 목록의 강조는 패널을 보는 동안 남깁니다.
- "모두 읽음"을 누르거나 패널을 닫으면 강조도 즉시 지웁니다. 서버 응답을 기다리지 않습니다.

## 로그인 상태 (useMe)

`src/lib/useMe.ts`의 `useMe()`가 `GET /api/me` 결과를 `{ user, loading }`으로 돌려줍니다. `Nav`, `TopBar`, `MarathonsPage`가 함께 씁니다.

```ts
const { user, loading } = useMe()
if (loading) { /* 자리 표시(skeleton) — 로그인/비로그인 화면 어느 쪽도 그리지 않음 */ }
```

새로고침 직후 `/api/me` 응답 전에는 로그인 여부를 알 수 없으므로, 그동안 비로그인 화면(로그인 버튼)을 먼저 그리지 않고 자리 표시만 보여 줍니다.  
활동 페이지도 기록·계획을 처음 불러오는 동안에는 빈 화면 대신 로딩 표시를 보여 줍니다.

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

## 통계 페이지 (Stats)

화면의 숫자는 대부분 브라우저에서 계산합니다. `["records"]` · `["plans", from, to]` · `["participations"]` 쿼리 결과를 `src/lib/stats.ts`의 순수 함수에 넘깁니다. 통계 전용 API는 `GET /api/stats/personal-bests`(최장 거리 · 최장 시간)만 씁니다.

**기간 선택** (`periodRange`) — 요약 박스와 거리 분포에 적용됩니다. 기본값은 이번 달입니다.

| 기간 | 범위 | 증감 비교 대상 |
|------|------|----------------|
| 이번 주 | 이번 주 월요일 ~ 오늘 | 지난주 월요일 ~ 지난주 같은 요일 |
| 이번 달 | 1일 ~ 오늘 | 지난달 1일 ~ 같은 날 (그 달에 없는 날이면 말일) |
| 올해 | 1월 1일 ~ 오늘 | 작년 1월 1일 ~ 같은 날 |
| 전체 | 모든 기록 | 없음 |

직전 기간 전체가 아니라 같은 시점까지와 비교합니다. 진행 중인 기간을 끝난 기간과 비교하면 항상 적게 나오기 때문입니다. 비교 대상 기간에 기록이 없으면 증감을 표시하지 않습니다.

**주간 거리** (`weeklyStats`) — 최근 12주(월 ~ 일)의 거리 합계와 훈련 계획 달성률입니다.

```
달성률 = 완료로 표시한 계획 수 / 계획 수   (휴식(rest) 계획은 제외, 이번 주는 오늘까지의 계획만)
```

계획이 없는 주는 달성률이 `null`이고 차트에 점을 찍지 않습니다.

**종목별 최고 기록** (`distancePBs`) — 5K · 10K · 하프 · 풀 각각 아래 둘 중 가장 빠른 기록입니다.

1. 내 마라톤의 완주 기록 (`category`가 `5K` · `10K` · `Half` · `Full`이고 `finishTime`이 있는 것)
2. 거리가 종목 거리의 −2% ~ +5% 안에 드는 러닝 기록 (GPS 오차 감안. 5K는 4.90 ~ 5.25km, 하프는 20.68 ~ 22.15km)

**최고 페이스** (`bestPaceRun`) — 5km 이상 달린 기록만 봅니다. `personal-bests` API의 `bestPace`는 거리 제한이 없어 화면에서 쓰지 않습니다.

## 러닝 기록 중복 판정과 시간 기준

판정 로직은 `src/lib/runs.ts`에 있고, MCP 도구(`add_run` · `import_runs`)와 TCX 임포트가 같이 씁니다.

1. `external_id`(워치 활동 고유 ID)가 같으면 같은 기록
2. 날짜가 같고 거리 차이가 100m 이내면 같은 기록  
   단, 양쪽 모두 `external_id`가 있는데 서로 다르면 다른 기록으로 봅니다 (같은 날 같은 코스를 두 번 뛴 경우).

시간은 판정에 쓰지 않습니다. 같은 활동이라도 이동 시간과 총 경과 시간이 섞여 들어와 몇 초씩 어긋나기 때문입니다.

| 컬럼 | 뜻 |
|------|----|
| `duration` | 이동 시간. 정지 시간 제외, 페이스 계산 기준 (TCX에서는 Lap `TotalTimeSeconds` 합계) |
| `elapsed` | 총 경과 시간. 정지 시간 포함, 모르면 NULL (TCX에서는 시작 시각 ~ 마지막 Trackpoint) |

- 기록을 지우면(soft delete) `external_id`도 함께 비웁니다. 유니크 제약 `(user_id, external_id)`에 걸리지 않고 같은 활동을 다시 가져올 수 있습니다.
- `POST /api/records`(화면에서 직접 추가)와 CSV 임포트에는 중복 검사가 없습니다.

## 날짜 기준

날짜는 모두 한국 시간의 `YYYY-MM-DD` 문자열입니다.

- **서버**(Vercel은 UTC): "오늘"은 `src/lib/plans.ts`의 `kstToday()`로 구하고, 날짜 계산은 `shiftDate` · `mondayOf`를 씁니다.
- **브라우저**: `Date`를 문자열로 바꿀 때는 `src/lib/utils.ts`의 `toDateStr()`(로컬 날짜)을 씁니다.
- `toISOString()`은 UTC 기준이라 한국 시간 00:00 ~ 09:00에는 전날 날짜가 나오고, `new Date("YYYY-MM-DD")`는 UTC 자정으로 해석되어 하루가 밀립니다. 날짜를 구할 때 쓰지 않습니다.

## Claude 연동 (MCP)

`POST /api/mcp`는 상태 없는(stateless) JSON-RPC 엔드포인트입니다. 세션을 만들지 않고 요청마다 JSON으로 응답하며, GET·DELETE는 405입니다.  
도구 정의와 실행은 `src/lib/mcpTools.ts`에 있습니다.

| 도구 | 동작 | 종류 |
|------|------|------|
| `get_overview` | 오늘 날짜, 이번 주 계획·거리, 최근 8주 주간 거리, 다가오는 대회, 신발 누적 거리·은퇴 여부 | 읽기 |
| `list_runs` | 기간 안의 러닝 기록 (기본 최근 30일) | 읽기 |
| `add_run` | 러닝 기록 1건 추가 (같은 날짜에 거리 차이가 100m 이내인 기록이 있으면 새로 만들지 않음) | 쓰기 |
| `update_run` | 기록 1건 수정 (`id` 또는 `date`로 지정, 보낸 항목만 변경). 신발·훈련 종류·`external_id`·`elapsed`를 나중에 채울 때 사용 | 쓰기 |
| `import_runs` | 기록 대량 등록 (한 번에 최대 200건). 중복이면 건너뛰거나 빠진 정보만 채우고, `overwrite: true`면 보낸 값으로 덮어씀. 추가·갱신·건너뜀·실패 건수와 항목별 이유를 돌려줌 | 쓰기 |
| `merge_runs` | 중복 기록 2건 합치기 (`keep_id`, `remove_id`, 같은 날짜만). 남기는 기록의 빈 항목을 지우는 기록의 값으로 채우고 지우는 기록은 삭제 | 쓰기 |
| `delete_run` | 기록 1건 삭제 (soft delete) | 쓰기 |
| `list_plans` | 기간 안의 훈련 계획 (기본 이번 주 월요일 ~ 다음 주 일요일) | 읽기 |
| `save_plans` | 계획 여러 날 저장 (한 번에 최대 62일, 같은 날짜는 덮어쓰기. 저장 전에 전부 검사해 하나라도 잘못되면 아무것도 저장하지 않음) | 쓰기 |
| `set_plan_done` | 계획 완료 여부 변경 | 쓰기 |
| `delete_plan` | 계획 삭제 | 쓰기 |
| `list_shoes` | 신발 전체 (브랜드·모델·용도, 누적 거리, 달린 횟수, 은퇴 여부) | 읽기 |
| `add_shoe` | 신발 등록 (같은 이름이 있으면 보낸 항목만 갱신). 등록 즉시 `add_run` · `update_run`의 `shoe`에 사용 가능 | 쓰기 |
| `retire_shoe` | 신발 은퇴 처리 / 되돌리기 | 쓰기 |
| `list_races` | 참가 대회 목록 (완주 기록·목표 기록 포함) | 읽기 |
| `add_race` | 참가 대회 저장 (대회 목록에 같은 날짜·이름이 있으면 연결, 없으면 본인에게만 보이는 대회로 생성. 이미 저장한 대회면 보낸 항목만 갱신) | 쓰기 |

도구는 모두 16개이고 `serverInfo.version`은 `1.1.0`입니다. 도구를 추가·변경해 배포한 뒤에는 Claude에서 커넥터를 다시 연결해야 새 목록이 보입니다.  
기록을 돌려주는 도구(`list_runs`, `add_run`, `update_run` 등)의 기록 항목에는 `elapsed`와 `external_id`가 함께 들어 있습니다.  
`import_runs`는 한 번에 200건까지 처리하므로 `/api/mcp`의 `maxDuration`을 60초로 두었습니다.

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
- **활동 ID · 시간**: `Activity/Id`를 `external_id`로 저장합니다. `duration`은 Lap `TotalTimeSeconds` 합계(이동 시간), `elapsed`는 시작 시각부터 마지막 Trackpoint까지(총 경과 시간)입니다.
- **중복 방지**: [중복 판정](#러닝-기록-중복-판정과-시간-기준)에 걸리는 기록이 이미 있으면 새로 만들지 않고 `200 { duplicate: true, data: 기존 기록, filled: [...] }`을 돌려줍니다. 이때 기존 기록에 비어 있던 항목(`external_id`, `elapsed`, 평균·최고 심박, 칼로리, GPS 경로)만 채우며, 이미 있는 값은 바꾸지 않습니다. 새로 저장하면 `201`입니다.
- **여러 파일**: 요청 1번에 파일 1개만 받습니다. 활동 페이지에서 파일을 여러 개 고르면 클라이언트가 파일마다 순서대로 요청하고, 끝나면 결과 모달(`TcxImportModal`)에서 추가된 기록의 훈련 종류(`run_type`)와 신발(`shoe_id`)을 바로 고를 수 있습니다.
