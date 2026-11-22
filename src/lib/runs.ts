import prisma from '@/src/lib/prisma'

// 러닝 기록 중복 판정 공용 로직. MCP 도구(add_run · import_runs)와 TCX 임포트가 같이 씀
//
// 판정 순서
//  1) external_id(워치 활동 고유 ID)가 같으면 같은 기록
//  2) 날짜가 같고 거리 차이가 100m 이내면 같은 기록
//     단, 양쪽 모두 external_id 가 있는데 서로 다르면 다른 기록으로 봄 (같은 날 같은 코스를 두 번 뛴 경우)
// 시간(duration)은 이동 시간·총 경과 시간이 섞여 들어와 몇 초씩 어긋나므로 판정에 쓰지 않음

export const DIST_TOLERANCE_KM = 0.1

export interface RunKey {
  id: number | null // null = 아직 저장 전(같은 요청 안에서 먼저 나온 항목)
  date: string
  distance: number
  externalId: string | null
}

export interface RunMatch<T extends RunKey> {
  run: T
  by: 'external_id' | 'date_distance'
}

export const cleanExternalId = (v: unknown) => String(v ?? '').trim().slice(0, 100)

// runs 는 id 오름차순. 같은 조건이면 먼저 저장된 기록이 걸림
export function matchRun<T extends RunKey>(
  runs: T[],
  item: { date: string; distance: number; externalId?: string | null },
): RunMatch<T> | null {
  if (item.externalId) {
    const same = runs.find((r) => r.externalId === item.externalId)
    if (same) return { run: same, by: 'external_id' }
  }
  const near = runs.find(
    (r) =>
      r.date === item.date &&
      Math.abs(r.distance - item.distance) <= DIST_TOLERANCE_KM + 1e-9 &&
      !(item.externalId && r.externalId),
  )
  return near ? { run: near, by: 'date_distance' } : null
}

// DB 에서 같은 기록 찾기 (삭제된 기록 제외)
export async function findDuplicateRun(
  userId: number,
  item: { date: string; distance: number; externalId?: string | null },
) {
  const candidates = await prisma.activity.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        ...(item.externalId ? [{ externalId: item.externalId }] : []),
        { date: item.date, distance: { gte: item.distance - DIST_TOLERANCE_KM - 0.001, lte: item.distance + DIST_TOLERANCE_KM + 0.001 } },
      ],
    },
    orderBy: { id: 'asc' },
  })
  return matchRun(candidates, item)
}

// 기록을 지울 때 쓰는 값. external_id 를 비워야 같은 활동을 나중에 다시 가져올 수 있음 (유니크 제약)
export const deletedRun = () => ({ deletedAt: new Date(), externalId: null })
