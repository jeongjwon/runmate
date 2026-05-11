import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { XMLParser } from 'fast-xml-parser'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

// 초(sec) → "분'초"" 형식의 페이스 문자열 반환 (예: 5'30")
function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '-'
  const spk = durSec / distKm                      // 1km당 소요 초
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

// 초 → "h:mm:ss" 또는 "m:ss" 형식 (1시간 미만은 분:초만 표시)
function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

// DB 조회 결과에 duration_formatted 필드를 추가해서 반환
function withFormatted(r: any) {
  return { ...r, duration_formatted: formatDuration(r.duration) }
}

// POST /api/records/import/tcx
// multipart/form-data 로 TCX 파일을 받아 파싱 후 activity로 저장
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

  // 폼에서 TCX 파일과 부가 메타데이터 추출
  const file = formData.get('tcx')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'TCX 파일이 없습니다' }, { status: 400 })
  }

  const routeType = (formData.get('route_type') as string) || 'road'
  const weather   = (formData.get('weather')    as string) || ''
  const notes     = (formData.get('notes')      as string) || ''

  // 파일 바이너리를 UTF-8 문자열로 변환 후 XML 파싱
  // TCX는 표준 UTF-8 XML 형식이므로 별도 인코딩 변환 불필요
  const buffer = Buffer.from(await file.arrayBuffer())
  const parser = new XMLParser({ ignoreAttributes: false })
  let parsed: any
  try {
    parsed = parser.parse(buffer.toString('utf-8'))
  } catch {
    return NextResponse.json({ error: 'TCX 파싱 실패' }, { status: 400 })
  }

  // TCX 구조: TrainingCenterDatabase > Activities > Activity
  const activity = parsed?.TrainingCenterDatabase?.Activities?.Activity
  if (!activity) {
    return NextResponse.json({ error: '활동 데이터가 없습니다' }, { status: 400 })
  }

  // 하나의 활동은 여러 Lap(구간)으로 구성됨
  // Lap이 1개일 경우 배열이 아닌 객체로 파싱되므로 항상 배열로 정규화
  const laps = Array.isArray(activity.Lap) ? activity.Lap : [activity.Lap].filter(Boolean)
  if (!laps.length) {
    return NextResponse.json({ error: '랩 데이터가 없습니다' }, { status: 400 })
  }

  let totalTimeSec = 0, totalDistM = 0, totalCal = 0, hrSum = 0, hrCount = 0
  const allPts: [number, number][] = []   // 전체 GPS 좌표 [lat, lng]

  // 모든 Lap을 순회하며 시간·거리·칼로리·심박·GPS 좌표를 누적
  for (const lap of laps) {
    totalTimeSec += Number(lap.TotalTimeSeconds) || 0
    totalDistM   += Number(lap.DistanceMeters)   || 0
    totalCal     += Number(lap.Calories)          || 0

    // Trackpoint: 1초 단위로 기록된 GPS 측정점 (수천 개 존재 가능)
    // 단일 Trackpoint인 경우에도 배열로 정규화
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

  // GPS 좌표 균등 간격 샘플링: 400개 초과 시 step 간격으로 추출
  // 예) 4000개 → step=11 → 약 364개로 압축 → 지도 렌더링 부하 감소
  const step    = allPts.length > 400 ? Math.floor(allPts.length / 400) + 1 : 1
  const sampled = allPts.filter((_, i) => i % step === 0)

  // 활동 시작 날짜: TCX의 Activity.Id(ISO 8601 UTC)를 KST(+9h)로 변환
  // 파싱 실패 시 오늘 날짜로 폴백
  let date = new Date().toISOString().split('T')[0]
  if (activity.Id) {
    try {
      const kst = new Date(new Date(activity.Id).getTime() + 9 * 3600 * 1000)
      date = kst.toISOString().split('T')[0]
    } catch {}
  }

  // 단위 변환: m → km (소수점 2자리), 부동소수점 오차 방지를 위해 반올림
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
      paceSeconds: distKm > 0 ? Math.round(durSec / distKm) : 0,  // 최고기록 정렬용 숫자 페이스
      heartRate:   avgHR,
      calories:    totalCal,
      routeType,
      weather,
      notes,
      routeData:   JSON.stringify(sampled),   // 샘플링된 GPS 좌표 JSON 직렬화
    },
  })

  return NextResponse.json(
    { data: withFormatted(r), message: 'TCX 기록이 추가되었습니다' },
    { status: 201 }
  )
}
