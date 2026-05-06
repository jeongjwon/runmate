import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

// GET /api/stats/personal-bests
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  const userId = session.user.id

  // 3개 쿼리 병렬 실행 — 각각 인덱스 활용
  const [bestDistance, bestDuration, bestPace] = await Promise.all([
    prisma.activity.findFirst({
      where: { userId, deletedAt: null, distance: { gt: 0 } },
      orderBy: { distance: 'desc' },
      select: { id: true, date: true, distance: true, duration: true, pace: true },
    }),
    prisma.activity.findFirst({
      where: { userId, deletedAt: null, duration: { gt: 0 } },
      orderBy: { duration: 'desc' },
      select: { id: true, date: true, distance: true, duration: true, pace: true },
    }),
    prisma.activity.findFirst({
      where: { userId, deletedAt: null, paceSeconds: { gt: 0 } },
      orderBy: { paceSeconds: 'asc' },
      select: { id: true, date: true, distance: true, duration: true, pace: true, paceSeconds: true },
    }),
  ])

  return NextResponse.json({
    data: {
      bestDistance: bestDistance
        ? { ...bestDistance, duration_formatted: formatDuration(bestDistance.duration) }
        : null,
      bestDuration: bestDuration
        ? { ...bestDuration, duration_formatted: formatDuration(bestDuration.duration) }
        : null,
      bestPace: bestPace
        ? { ...bestPace, duration_formatted: formatDuration(bestPace.duration) }
        : null,
    },
  })
}
