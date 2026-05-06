import prisma from '@/src/lib/prisma'

export async function syncMonthlyKmBadges(userId: number) {
  const records = await prisma.activity.findMany({
    where: { userId, deletedAt: null },
    select: { date: true, distance: true },
  })

  const monthlyMap: Record<string, number> = {}
  for (const r of records) {
    const ym = r.date.slice(0, 7)
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
