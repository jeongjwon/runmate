import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { kstToday } from '@/src/lib/plans'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ distance: 0 })

  const userId = session.user.id
  const ym = kstToday().slice(0, 7) // 서버는 UTC 라 한국 날짜로 계산

  const records = await prisma.activity.findMany({
    where: { userId, deletedAt: null, date: { startsWith: ym } },
    select: { distance: true },
  })

  const distance = records.reduce((s, r) => s + r.distance, 0)
  return NextResponse.json({ distance: Math.round(distance * 10) / 10 })
}
