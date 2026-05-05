import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '-'
  const spk = durSec / distKm
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

function parseDuration(s: string): number {
  const parts = s.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function withFormatted(r: any) {
  return { ...r, duration_formatted: formatDuration(r.duration) }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const r = await prisma.runningRecord.findFirst({
    where: { id: Number(params.id), userId: session.user.id, deletedAt: null },
  })
  if (!r) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 })

  return NextResponse.json({ data: withFormatted(r) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const r = await prisma.runningRecord.findFirst({
    where: { id: Number(params.id), userId: session.user.id, deletedAt: null },
  })
  if (!r) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { date, distance, duration, heart_rate, calories, route_type, weather, notes } = body

  const durSec = duration ? parseDuration(duration) : r.duration
  const dist   = distance ? Number(distance) : r.distance

  const updated = await prisma.runningRecord.update({
    where: { id: r.id },
    data: {
      ...(date       ? { date }                     : {}),
      ...(distance   ? { distance: dist }           : {}),
      ...(duration   ? { duration: durSec }         : {}),
      ...(heart_rate !== undefined ? { heartRate: Number(heart_rate) } : {}),
      ...(calories   !== undefined ? { calories:  Number(calories)   } : {}),
      ...(route_type ? { routeType: route_type }    : {}),
      ...(weather    ? { weather }                  : {}),
      notes: notes ?? r.notes,
      pace: calcPace(dist, durSec),
    },
  })

  return NextResponse.json({ data: withFormatted(updated), message: '기록이 수정되었습니다' })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const r = await prisma.runningRecord.findFirst({
    where: { id: Number(params.id), userId: session.user.id, deletedAt: null },
  })
  if (!r) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 })

  await prisma.runningRecord.update({ where: { id: r.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ message: '기록이 삭제되었습니다' })
}
