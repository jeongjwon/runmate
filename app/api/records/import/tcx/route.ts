import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { XMLParser } from 'fast-xml-parser'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '-'
  const spk = durSec / distKm
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: '폼 데이터 파싱 실패' }, { status: 400 })
  }

  const file = formData.get('tcx')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'TCX 파일이 없습니다' }, { status: 400 })
  }

  const routeType = (formData.get('route_type') as string) || 'road'
  const weather   = (formData.get('weather')    as string) || ''
  const notes     = (formData.get('notes')      as string) || ''

  const buffer = Buffer.from(await file.arrayBuffer())

  const parser = new XMLParser({ ignoreAttributes: false })
  let parsed: any
  try {
    parsed = parser.parse(buffer.toString('utf-8'))
  } catch {
    return NextResponse.json({ error: 'TCX 파싱 실패' }, { status: 400 })
  }

  const activity = parsed?.TrainingCenterDatabase?.Activities?.Activity
  if (!activity) {
    return NextResponse.json({ error: '활동 데이터가 없습니다' }, { status: 400 })
  }

  const laps = Array.isArray(activity.Lap) ? activity.Lap : [activity.Lap].filter(Boolean)
  if (!laps.length) {
    return NextResponse.json({ error: '랩 데이터가 없습니다' }, { status: 400 })
  }

  let totalTimeSec = 0, totalDistM = 0, totalCal = 0, hrSum = 0, hrCount = 0
  const allPts: [number, number][] = []

  for (const lap of laps) {
    totalTimeSec += Number(lap.TotalTimeSeconds) || 0
    totalDistM   += Number(lap.DistanceMeters)   || 0
    totalCal     += Number(lap.Calories)          || 0

    const trackpoints = lap.Track?.Trackpoint
    const tps = Array.isArray(trackpoints) ? trackpoints : [trackpoints].filter(Boolean)
    for (const tp of tps) {
      const hr = Number(tp?.HeartRateBpm?.Value) || 0
      if (hr > 0) { hrSum += hr; hrCount++ }
      const lat = Number(tp?.Position?.LatitudeDegrees)
      const lng = Number(tp?.Position?.LongitudeDegrees)
      if (lat && lng) allPts.push([lat, lng])
    }
  }

  const step    = allPts.length > 400 ? Math.floor(allPts.length / 400) + 1 : 1
  const sampled = allPts.filter((_, i) => i % step === 0)

  let date = new Date().toISOString().split('T')[0]
  if (activity.Id) {
    try {
      const kst = new Date(new Date(activity.Id).getTime() + 9 * 3600 * 1000)
      date = kst.toISOString().split('T')[0]
    } catch {}
  }

  const distKm = Math.round(totalDistM / 10) / 100
  const durSec = Math.round(totalTimeSec)
  const avgHR  = hrCount > 0 ? Math.round(hrSum / hrCount) : 0

  const r = await prisma.activity.create({
    data: {
      userId:      session.user.id,
      date,
      distance:    distKm,
      duration:    durSec,
      pace:        calcPace(distKm, durSec),
      paceSeconds: distKm > 0 ? Math.round(durSec / distKm) : 0,
      heartRate:   avgHR,
      calories:    totalCal,
      routeType,
      weather,
      notes,
      routeData: JSON.stringify(sampled),
    },
  })

  return NextResponse.json(
    { data: withFormatted(r), message: 'TCX 기록이 추가되었습니다' },
    { status: 201 }
  )
}
