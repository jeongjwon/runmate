import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

function parseDuration(s: string): number {
  const trimmed = s.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  const parts = trimmed.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '-'
  const spk = durSec / distKm
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/** Extract YYYY-MM-DD from filename like "부산광역시러닝20260504152509.csv" */
function dateFromFilename(name: string): string | null {
  const m = name.match(/(\d{4})(\d{2})(\d{2})\d{6}/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: '폼 데이터 파싱 실패' }, { status: 400 }) }

  const file = formData.get('csv')
  if (!file || typeof file === 'string')
    return NextResponse.json({ error: 'CSV 파일이 없습니다' }, { status: 400 })

  const filename = (file as File).name ?? ''
  const text = Buffer.from(await (file as File).arrayBuffer()).toString('utf-8')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2)
    return NextResponse.json({ error: '데이터가 없습니다' }, { status: 400 })

  const rawHeaders = parseCSVLine(lines[0])
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'))

  const col = (names: string[]): number => {
    for (const n of names) {
      const i = headers.indexOf(n)
      if (i !== -1) return i
    }
    return -1
  }

  // ── Garmin split format detection ─────────────────────────────────────────
  // Headers: Split, Time, Moving Time, GetDistance, ..., Avg HR, Calories
  const iSplit = col(['split'])
  const iGetDist = col(['getdistance', 'get_distance'])
  const isGarminSplit = iSplit !== -1 && iGetDist !== -1

  if (isGarminSplit) {
    // Find the Summary row
    const iTime = col(['time'])
    const iAvgHR = col(['avg_hr', 'avg_heart_rate'])
    const iCal = col(['calories', 'cal'])

    const summaryLine = lines.slice(1).find(l => {
      const cols = parseCSVLine(l)
      return cols[iSplit]?.toLowerCase() === 'summary'
    })

    if (!summaryLine) {
      return NextResponse.json({ error: 'Summary 행을 찾을 수 없습니다' }, { status: 422 })
    }

    const cols = parseCSVLine(summaryLine)
    const distance = parseFloat(cols[iGetDist] ?? '')
    const duration = iTime >= 0 ? parseDuration(cols[iTime] ?? '') : 0
    const heartRate = iAvgHR >= 0 ? parseInt(cols[iAvgHR] ?? '') || 0 : 0
    const calories = iCal >= 0 ? parseInt(cols[iCal] ?? '') || 0 : 0
    const date = dateFromFilename(filename) ?? todayStr()

    if (isNaN(distance) || distance <= 0)
      return NextResponse.json({ error: '유효하지 않은 거리' }, { status: 422 })
    if (!duration)
      return NextResponse.json({ error: '유효하지 않은 시간' }, { status: 422 })

    const r = await prisma.activity.create({
      data: {
        userId: session.user.id,
        date,
        distance,
        duration,
        pace: calcPace(distance, duration),
        heartRate,
        calories,
        routeType: 'road',
        weather: '',
        notes: '',
        routeData: '',
      },
    })

    return NextResponse.json({ message: '1개 기록 추가됨', errors: [], ids: [r.id] }, { status: 201 })
  }

  // ── Generic row-per-activity format ───────────────────────────────────────
  const iDate    = col(['date'])
  const iDist    = col(['distance', 'dist_km', 'distance_km'])
  const iDur     = col(['duration', 'duration_sec', 'time'])
  const iHR      = col(['heart_rate', 'avg_hr', 'heartrate', 'hr'])
  const iCal     = col(['calories', 'cal'])
  const iRoute   = col(['route_type', 'route'])
  const iWeather = col(['weather'])
  const iNotes   = col(['notes', 'note', 'memo'])

  const created: number[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    try {
      const date      = (iDate    >= 0 ? cols[iDate]    : cols[0]) ?? ''
      const rawDist   = iDist     >= 0 ? cols[iDist]    : cols[1]
      const rawDur    = iDur      >= 0 ? cols[iDur]     : cols[2]
      const rawHR     = iHR       >= 0 ? cols[iHR]      : cols[3]
      const rawCal    = iCal      >= 0 ? cols[iCal]     : cols[4]
      const routeType = (iRoute   >= 0 ? cols[iRoute]   : cols[5]) || 'road'
      const weather   = (iWeather >= 0 ? cols[iWeather] : cols[6]) || ''
      const notes     = (iNotes   >= 0 ? cols[iNotes]   : cols[7]) || ''

      const distance  = parseFloat(rawDist ?? '')
      const duration  = parseDuration(rawDur ?? '')
      const heartRate = parseInt(rawHR ?? '') || 0
      const calories  = parseInt(rawCal ?? '') || 0

      if (!date)                            { errors.push(`행 ${i + 1}: 날짜 누락`); continue }
      if (isNaN(distance) || distance <= 0) { errors.push(`행 ${i + 1}: 유효하지 않은 거리`); continue }
      if (!duration)                        { errors.push(`행 ${i + 1}: 유효하지 않은 시간`); continue }

      const r = await prisma.activity.create({
        data: {
          userId: session.user.id,
          date, distance, duration,
          pace: calcPace(distance, duration),
          heartRate, calories, routeType, weather, notes, routeData: '',
        },
      })
      created.push(r.id)
    } catch {
      errors.push(`행 ${i + 1}: 저장 실패`)
    }
  }

  if (created.length === 0 && errors.length > 0)
    return NextResponse.json({ error: '가져오기 실패', errors }, { status: 422 })

  return NextResponse.json({ message: `${created.length}개 기록 추가됨`, errors }, { status: 201 })
}
