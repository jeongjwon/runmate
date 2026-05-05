import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function calcPace(dist: number, sec: number): string {
  if (!dist || !sec) return '-'
  const spk = sec / dist
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ data: [] })

  const userId = session.user.id
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') ?? ''
  const year   = searchParams.get('year')   ?? ''

  const records = await prisma.runningRecord.findMany({
    where: { userId, deletedAt: null },
    orderBy: { date: 'asc' },
  })

  if (period === 'weekly') {
    const now = new Date()
    const result = []
    for (let i = 7; i >= 0; i--) {
      const monday = getMonday(new Date(now.getTime() - i * 7 * 86400000))
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
      const from = toDateStr(monday), to = toDateStr(sunday)
      const week = records.filter(r => r.date >= from && r.date <= to)
      const dist = week.reduce((s, r) => s + r.distance, 0)
      const sec  = week.reduce((s, r) => s + r.duration, 0)
      result.push({
        week: `${monday.getMonth()+1}/${monday.getDate()} – ${sunday.getMonth()+1}/${sunday.getDate()}`,
        total_distance: dist,
        total_duration: sec,
        total_duration_formatted: formatDuration(sec),
        run_count: week.length,
        avg_pace: calcPace(dist, sec),
      })
    }
    return NextResponse.json({ data: result, period: 'weekly' })
  }

  if (period === 'monthly') {
    const y = Number(year) || new Date().getFullYear()
    const result = Array.from({ length: 12 }, (_, mo) => {
      const ym    = `${y}-${String(mo + 1).padStart(2, '0')}`
      const month = records.filter(r => r.date.startsWith(ym))
      const dist  = month.reduce((s, r) => s + r.distance, 0)
      const sec   = month.reduce((s, r) => s + r.duration, 0)
      const best  = Math.max(0, ...month.map(r => r.distance))
      return {
        month: `${mo + 1}월`,
        total_distance: dist,
        total_duration: sec,
        total_duration_formatted: formatDuration(sec),
        run_count: month.length,
        avg_pace: calcPace(dist, sec),
        best_distance: best,
      }
    })
    return NextResponse.json({ data: result, period: 'monthly', year: y })
  }

  if (period === 'yearly') {
    const years = [...new Set(records.map(r => r.date.slice(0, 4)))].sort()
    const result = years.map(yr => {
      const y    = records.filter(r => r.date.startsWith(yr))
      const dist = y.reduce((s, r) => s + r.distance, 0)
      const sec  = y.reduce((s, r) => s + r.duration, 0)
      return {
        year: yr,
        total_distance: dist,
        total_duration: sec,
        total_duration_formatted: formatDuration(sec),
        run_count: y.length,
        avg_pace: calcPace(dist, sec),
      }
    })
    return NextResponse.json({ data: result, period: 'yearly' })
  }

  return NextResponse.json(
    { error: 'period 파라미터가 필요합니다 (weekly/monthly/yearly)' },
    { status: 400 }
  )
}
