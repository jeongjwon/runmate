import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { syncMonthlyKmBadges } from '@/src/lib/syncBadges'
import { resolveShoeId } from '@/src/lib/shoes'

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

  const r = await prisma.activity.findFirst({
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

  const r = await prisma.activity.findFirst({
    where: { id: Number(params.id), userId: session.user.id, deletedAt: null },
  })
  if (!r) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { date, distance, duration, heart_rate, max_heart_rate, calories, route_type, run_type, shoe_id, weather, notes } = body

  // shoe_id 가 넘어온 경우에만 신발을 바꿈 (빈 값이면 신발 없음으로)
  let shoeId: number | null | undefined
  try {
    shoeId = shoe_id !== undefined ? await resolveShoeId(session.user.id, shoe_id) : undefined
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  const durSec = duration ? parseDuration(duration) : r.duration
  const dist   = distance ? Number(distance) : r.distance

  const updated = await prisma.activity.update({
    where: { id: r.id },
    data: {
      ...(date       ? { date }                     : {}),
      ...(distance   ? { distance: dist }           : {}),
      ...(duration   ? { duration: durSec }         : {}),
      ...(heart_rate !== undefined ? { heartRate: Number(heart_rate) } : {}),
      ...(max_heart_rate !== undefined ? { maxHeartRate: Number(max_heart_rate) || 0 } : {}),
      ...(calories   !== undefined ? { calories:  Number(calories)   } : {}),
      ...(route_type ? { routeType: route_type }    : {}),
      ...(run_type   !== undefined ? { runType: String(run_type) }   : {}),
      ...(shoeId     !== undefined ? { shoeId }                      : {}),
      ...(weather    ? { weather }                  : {}),
      notes: notes ?? r.notes,
      pace: calcPace(dist, durSec),
      paceSeconds: dist > 0 ? Math.round(durSec / dist) : 0,
    },
  })

  // 월간 거리 배지는 날짜·거리가 바뀔 때만 다시 계산 (훈련 종류만 바꾸는 요청은 건너뜀)
  if (date || distance) syncMonthlyKmBadges(session.user.id).catch(() => {})

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

  const r = await prisma.activity.findFirst({
    where: { id: Number(params.id), userId: session.user.id, deletedAt: null },
  })
  if (!r) return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 })

  await prisma.activity.update({ where: { id: r.id }, data: { deletedAt: new Date() } })

  syncMonthlyKmBadges(session.user.id).catch(() => {})

  return NextResponse.json({ message: '기록이 삭제되었습니다' })
}
