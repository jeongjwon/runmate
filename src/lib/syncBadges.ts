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
        const existing = await prisma.userBadge.findUnique({
          where: { userId_badgeId_year_month: { userId, badgeId: def.id, year: y, month: m } },
        })

        if (!existing) {
          await prisma.userBadge.create({
            data: { userId, badgeId: def.id, year: y, month: m },
          })

          const refId = `badge:${def.code}:${y}:${m}`
          await prisma.notification.upsert({
            where: { userId_type_refId: { userId, type: 'badge', refId } },
            update: {},
            create: {
              userId,
              type: 'badge',
              refId,
              title: `배지 획득! ${def.icon} ${def.name}`,
              body: `${y}년 ${m}월 ${def.description}`,
            },
          })
        }
      }
    }
  }
}
