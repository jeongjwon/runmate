import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

// "h:mm:ss" / "m:ss" / 순수 숫자(초) 형식을 모두 초 단위 정수로 변환
function parseDuration(s: string): number {
  const trimmed = s.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)   // 순수 숫자면 그대로 초
  const parts = trimmed.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

// 초(sec) → "분'초"" 형식의 페이스 문자열 반환 (예: 5'30")
function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '-'
  const spk = durSec / distKm
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

// 쉼표로 분리하되, 큰따옴표(") 안의 쉼표는 구분자로 취급하지 않는 CSV 파서
// 기본 split(',')은 "값, 값" 같은 따옴표 포함 필드를 잘못 분리하기 때문에 직접 구현
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // 연속된 "" 는 escaped 따옴표 → 리터럴 " 로 처리
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

// Garmin 파일명 패턴 "지역명YYYYMMDDHHMMSS.csv" 에서 날짜 추출
// 예: "부산광역시러닝20260504152509.csv" → "2026-05-04"
function dateFromFilename(name: string): string | null {
  const m = name.match(/(\d{4})(\d{2})(\d{2})\d{6}/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// POST /api/records/import/csv
// multipart/form-data 로 CSV 파일을 받아 포맷을 자동 감지 후 activity로 저장
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
  // CSV는 UTF-8 텍스트로 읽음 (EUC-KR 등 다른 인코딩은 미지원)
  const text = Buffer.from(await (file as File).arrayBuffer()).toString('utf-8')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2)
    return NextResponse.json({ error: '데이터가 없습니다' }, { status: 400 })

  // 헤더를 소문자 + 영숫자/언더스코어만 남기도록 정규화
  // 예: "Avg HR" → "avg_hr", "GetDistance" → "getdistance"
  const rawHeaders = parseCSVLine(lines[0])
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'))

  // 헤더 이름 후보 목록 중 실제로 존재하는 컬럼 인덱스를 반환 (없으면 -1)
  const col = (names: string[]): number => {
    for (const n of names) {
      const i = headers.indexOf(n)
      if (i !== -1) return i
    }
    return -1
  }

  // ── Garmin split 포맷 감지 ────────────────────────────────────────────────
  // Garmin CSV는 행 하나가 구간(split) 데이터이고 마지막에 Summary 행이 있는 구조:
  //   Split | Time | Moving Time | GetDistance | ... | Avg HR | Calories
  //   1     | 0:05 | ...         | 1.00        | ... | 152    | 45
  //   2     | 0:05 | ...         | 1.00        | ... | 160    | 43
  //   Summary | 0:52 | ...       | 10.00       | ... | 156    | 380  ← 이 행만 사용
  const iSplit   = col(['split'])
  const iGetDist = col(['getdistance', 'get_distance'])
  const isGarminSplit = iSplit !== -1 && iGetDist !== -1

  if (isGarminSplit) {
    const iTime  = col(['time'])
    const iAvgHR = col(['avg_hr', 'avg_heart_rate'])
    const iCal   = col(['calories', 'cal'])

    // split 컬럼 값이 "summary"인 행만 추출 (대소문자 무시)
    const summaryLine = lines.slice(1).find(l => {
      const cols = parseCSVLine(l)
      return cols[iSplit]?.toLowerCase() === 'summary'
    })

    if (!summaryLine) {
      return NextResponse.json({ error: 'Summary 행을 찾을 수 없습니다' }, { status: 422 })
    }

    const cols     = parseCSVLine(summaryLine)
    const distance = parseFloat(cols[iGetDist] ?? '')
    const duration = iTime >= 0 ? parseDuration(cols[iTime] ?? '') : 0
    const heartRate = iAvgHR >= 0 ? parseInt(cols[iAvgHR] ?? '') || 0 : 0
    const calories  = iCal   >= 0 ? parseInt(cols[iCal]   ?? '') || 0 : 0
    // 날짜는 파일명에서 추출, 실패 시 오늘 날짜로 폴백
    const date = dateFromFilename(filename) ?? todayStr()

    if (isNaN(distance) || distance <= 0)
      return NextResponse.json({ error: '유효하지 않은 거리' }, { status: 422 })
    if (!duration)
      return NextResponse.json({ error: '유효하지 않은 시간' }, { status: 422 })

    const r = await prisma.activity.create({
      data: {
        userId:      session.user.id,
        date,
        distance,
        duration,
        pace:        calcPace(distance, duration),
        paceSeconds: distance > 0 ? Math.round(duration / distance) : 0,
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

  // ── 일반 row-per-activity 포맷 ────────────────────────────────────────────
  // 행 하나가 활동 하나인 범용 포맷
  // 헤더명 후보를 여러 개 지정해 다양한 플랫폼의 CSV를 커버
  // 헤더가 없으면 컬럼 순서(0~7)로 폴백
  const iDate    = col(['date'])
  const iDist    = col(['distance', 'dist_km', 'distance_km'])
  const iDur     = col(['duration', 'duration_sec', 'time'])
  const iHR      = col(['heart_rate', 'avg_hr', 'heartrate', 'hr'])
  const iCal     = col(['calories', 'cal'])
  const iRoute   = col(['route_type', 'route'])
  const iWeather = col(['weather'])
  const iNotes   = col(['notes', 'note', 'memo'])

  const created: number[] = []
  const errors: string[]  = []

  // 헤더 행(index 0) 제외하고 데이터 행 순회
  // 한 행 실패가 전체 import를 막지 않도록 행별로 개별 처리
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

      if (!date)                            { errors.push(`행 ${i + 1}: 날짜 누락`);          continue }
      if (isNaN(distance) || distance <= 0) { errors.push(`행 ${i + 1}: 유효하지 않은 거리`); continue }
      if (!duration)                        { errors.push(`행 ${i + 1}: 유효하지 않은 시간`); continue }

      const r = await prisma.activity.create({
        data: {
          userId:      session.user.id,
          date, distance, duration,
          pace:        calcPace(distance, duration),
          paceSeconds: distance > 0 ? Math.round(duration / distance) : 0,
          heartRate, calories, routeType, weather, notes, routeData: '',
        },
      })
      created.push(r.id)
    } catch {
      errors.push(`행 ${i + 1}: 저장 실패`)
    }
  }

  // 성공한 행이 하나도 없고 에러만 있으면 422 반환
  // 일부 성공한 경우 201로 반환하되 errors 배열에 실패 행 정보 포함
  if (created.length === 0 && errors.length > 0)
    return NextResponse.json({ error: '가져오기 실패', errors }, { status: 422 })

  return NextResponse.json({ message: `${created.length}개 기록 추가됨`, errors }, { status: 201 })
}
