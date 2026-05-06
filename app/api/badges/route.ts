import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

// GET /api/badges — 사용자 배지 조회 + 월간 km 배지 자동 sync
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  const userId = session.user.id

  // 월간 km 배지 자동 sync
  await syncMonthlyKmBadges(userId)

  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { awardedAt: 'desc' }],
  })

  return NextResponse.json({ data: userBadges })
}

async function syncMonthlyKmBadges(userId: number) {
  // 월별 총 거리 계산
  const records = await prisma.activity.findMany({
    where: { userId, deletedAt: null },
    select: { date: true, distance: true },
  })

  const monthlyMap: Record<string, number> = {}
  for (const r of records) {
    const ym = r.date.slice(0, 7) // "2026-03"
    monthlyMap[ym] = (monthlyMap[ym] ?? 0) + r.distance
  }

  const monthlyKmDefs = await prisma.badgeDefinition.findMany({
    where: { type: 'monthly_km' },
    orderBy: { threshold: 'asc' },
  })

  for (const [ym, dist] of Object.entries(monthlyMap)) {
    const [y, m] = ym.split('-').map(Number)
    for (const def of monthlyKmDefs) {
      if (dist >= def.threshold) {
        await prisma.userBadge.upsert({
          where: { userId_badgeId_year_month: { userId, badgeId: def.id, year: y, month: m } },
          update: {},
          create: { userId, badgeId: def.id, year: y, month: m },
        })
      }
    }
  }
}
