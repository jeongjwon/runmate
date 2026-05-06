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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ data: [] })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to   = searchParams.get('to')   ?? ''

  const records = await prisma.activity.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
      ...(from ? { date: { gte: from } } : {}),
      ...(to   ? { date: { lte: to   } } : {}),
    },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json({ data: records.map(withFormatted) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { date, distance, duration, heart_rate, calories, route_type, weather, notes } = body

  const durSec = parseDuration(duration)
  if (!date || !distance || durSec <= 0) {
    return NextResponse.json({ error: '날짜, 거리, 시간은 필수입니다' }, { status: 400 })
  }

  const r = await prisma.activity.create({
    data: {
      userId:    session.user.id,
      date,
      distance:  Number(distance),
      duration:  durSec,
      pace:      calcPace(Number(distance), durSec),
      heartRate: Number(heart_rate) || 0,
      calories:  Number(calories)   || 0,
      routeType: route_type || 'road',
      weather:   weather   || '',
      notes:     notes     || '',
    },
  })

  return NextResponse.json({ data: withFormatted(r), message: '기록이 저장되었습니다' }, { status: 201 })
}
