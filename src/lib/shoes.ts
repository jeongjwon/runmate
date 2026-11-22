import prisma from '@/src/lib/prisma'

// 신발 목록 + 누적 거리(등록 전 거리 + 이 신발로 저장한 기록 합계)
export async function listShoes(userId: number) {
  const [shoes, sums] = await Promise.all([
    prisma.shoe.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.activity.groupBy({
      by: ['shoeId'],
      where: { userId, deletedAt: null, shoeId: { not: null } },
      _sum: { distance: true },
      _count: { _all: true },
    }),
  ])
  const byShoe = new Map(sums.map((s) => [s.shoeId, s]))

  return shoes.map((s) => {
    const sum = byShoe.get(s.id)
    return {
      id:      s.id,
      name:    s.name,
      brand:   s.brand,
      model:   s.model,
      purpose: s.purpose,
      startKm: s.startKm,
      retired: !!s.retiredAt,
      km:      Math.round((s.startKm + (sum?._sum.distance ?? 0)) * 100) / 100,
      runs:    sum?._count._all ?? 0,
    }
  })
}

// 요청으로 들어온 shoe_id 를 검증. 비어 있으면 null(신발 없음), 내 신발이 아니면 throw
export async function resolveShoeId(userId: number, raw: unknown): Promise<number | null> {
  if (raw === null || raw === undefined || raw === '' || raw === 0 || raw === '0') return null
  const id = Number(raw)
  const shoe = Number.isInteger(id) ? await prisma.shoe.findFirst({ where: { id, userId } }) : null
  if (!shoe) throw new Error('신발을 찾을 수 없습니다')
  return shoe.id
}

// 이름으로 내 신발 찾기 (앞뒤 공백·대소문자 무시). 신발 이름은 사용자 안에서 고유
export async function findShoeByName(userId: number, name: string) {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  const shoes = await prisma.shoe.findMany({ where: { userId }, orderBy: { id: 'asc' } })
  return shoes.find((s) => s.name.trim().toLowerCase() === wanted) ?? null
}

// 브랜드·모델·용도처럼 짧은 자유 입력 칸
export const shoeText = (v: unknown, max = 40) => String(v ?? '').trim().slice(0, max)
