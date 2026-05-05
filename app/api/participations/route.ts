import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function withFormattedTime(p: any) {
  return { ...p, finishTime: p.finishTime != null ? formatDuration(p.finishTime) : null }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const userId = session.user.id
  const parts = await prisma.marathonParticipation.findMany({
    where: { userId, deletedAt: null },
    include: { marathon: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: parts.map(withFormattedTime) })
}
