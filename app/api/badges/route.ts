import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { syncMonthlyKmBadges } from '@/src/lib/syncBadges'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  await syncMonthlyKmBadges(session.user.id)

  const userBadges = await prisma.userBadge.findMany({
    where: { userId: session.user.id },
    include: { badge: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { awardedAt: 'desc' }],
  })

  return NextResponse.json({ data: userBadges })
}
