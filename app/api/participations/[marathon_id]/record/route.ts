import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function parseDuration(str: string): number | null {
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function withFormattedTime(p: any) {
  return { ...p, finishTime: p.finishTime != null ? formatDuration(p.finishTime) : null }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { marathon_id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const userId    = session.user.id
  const marathonId = Number(params.marathon_id)
  const { category, finish_time, race_notes, certificate_url } = await req.json().catch(() => ({}))

  const p = await prisma.marathonParticipation.findFirst({
    where: { userId, marathonId, deletedAt: null },
  })
  if (!p) {
    return NextResponse.json({ error: '참가 신청을 찾을 수 없습니다' }, { status: 404 })
  }

  const finishTimeSec = finish_time ? parseDuration(finish_time) : undefined

  const updated = await prisma.marathonParticipation.update({
    where: { id: p.id },
    data: {
      ...(category !== undefined ? { category } : {}),
      ...(finishTimeSec !== undefined ? { finishTime: finishTimeSec } : {}),
      ...(race_notes !== undefined ? { raceNotes: race_notes } : {}),
      ...(certificate_url !== undefined ? { certificateUrl: certificate_url } : {}),
    },
  })

  return NextResponse.json({ data: withFormattedTime(updated), message: '기록이 저장되었습니다' })
}
