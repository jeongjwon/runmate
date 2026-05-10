import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function parseDateString(s: string): Date | null {
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const ko = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (ko) return new Date(Number(ko[1]), Number(ko[2]) - 1, Number(ko[3]))
  const dot = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/)
  if (dot) return new Date(Number(dot[1]), Number(dot[2]) - 1, Number(dot[3]))
  return null
}

async function generateDdayNotifications(userId: number) {
  const participations = await prisma.marathonParticipation.findMany({
    where: { userId, deletedAt: null },
    include: { marathon: { select: { id: true, name: true, date: true } } },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const p of participations) {
    const raceDate = parseDateString(p.marathon.date)
    if (!raceDate) continue

    const diffDays = Math.round((raceDate.getTime() - today.getTime()) / 86400000)

    for (const d of [7, 1]) {
      if (diffDays !== d) continue
      const type = `dday_${d}`
      const refId = `marathon:${p.marathon.id}:${p.marathon.date}`

      await prisma.notification.upsert({
        where: { userId_type_refId: { userId, type, refId } },
        update: {},
        create: {
          userId,
          type,
          refId,
          title: d === 1 ? `내일 대회 D-1! 🏃` : `대회 일주일 전 D-7`,
          body: `${p.marathon.name} — ${p.marathon.date}`,
        },
      })
    }
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ data: [] })

  const userId = session.user.id

  await generateDdayNotifications(userId)

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return NextResponse.json({ data: notifications, unreadCount })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const body = await req.json().catch(() => ({}))
  const ids: number[] | undefined = body.ids

  if (ids && ids.length > 0) {
    await prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { isRead: true },
    })
  } else {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })
  }

  return NextResponse.json({ ok: true })
}
