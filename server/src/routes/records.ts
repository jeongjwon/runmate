import { Router, Request, Response } from 'express'
import multer from 'multer'
import { XMLParser } from 'fast-xml-parser'
import prisma from '../db'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

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

router.get('/', async (req: Request, res: Response) => {
  const user = req.user as any
  if (!user) return res.json({ data: [] })

  const { from, to } = req.query as Record<string, string>
  const records = await prisma.runningRecord.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      ...(from ? { date: { gte: from } } : {}),
      ...(to   ? { date: { lte: to   } } : {}),
    },
    orderBy: { date: 'desc' },
  })
  res.json({ data: records.map(withFormatted) })
})

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any
  const r = await prisma.runningRecord.findFirst({
    where: { id: Number(req.params.id), userId: user.id, deletedAt: null },
  })
  if (!r) return res.status(404).json({ error: '기록을 찾을 수 없습니다' })
  res.json({ data: withFormatted(r) })
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any
  const { date, distance, duration, heart_rate, calories, route_type, weather, notes } = req.body

  const durSec = parseDuration(duration)
  if (!date || !distance || durSec <= 0)
    return res.status(400).json({ error: '날짜, 거리, 시간은 필수입니다' })

  const r = await prisma.runningRecord.create({
    data: {
      userId: user.id, date,
      distance: Number(distance),
      duration: durSec,
      pace: calcPace(Number(distance), durSec),
      heartRate: Number(heart_rate) || 0,
      calories:  Number(calories)   || 0,
      routeType: route_type || 'road',
      weather:   weather   || '',
      notes:     notes     || '',
    },
  })
  res.status(201).json({ data: withFormatted(r), message: '기록이 저장되었습니다' })
})

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any
  const r = await prisma.runningRecord.findFirst({
    where: { id: Number(req.params.id), userId: user.id, deletedAt: null },
  })
  if (!r) return res.status(404).json({ error: '기록을 찾을 수 없습니다' })

  const { date, distance, duration, heart_rate, calories, route_type, weather, notes } = req.body
  const durSec = duration ? parseDuration(duration) : r.duration
  const dist   = distance ? Number(distance) : r.distance

  const updated = await prisma.runningRecord.update({
    where: { id: r.id },
    data: {
      ...(date      ? { date }                      : {}),
      ...(distance  ? { distance: dist }            : {}),
      ...(duration  ? { duration: durSec }          : {}),
      ...(heart_rate !== undefined ? { heartRate: Number(heart_rate) } : {}),
      ...(calories   !== undefined ? { calories:  Number(calories)   } : {}),
      ...(route_type ? { routeType: route_type }   : {}),
      ...(weather    ? { weather }                 : {}),
      notes: notes ?? r.notes,
      pace: calcPace(dist, durSec),
    },
  })
  res.json({ data: withFormatted(updated), message: '기록이 수정되었습니다' })
})

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any
  const r = await prisma.runningRecord.findFirst({
    where: { id: Number(req.params.id), userId: user.id, deletedAt: null },
  })
  if (!r) return res.status(404).json({ error: '기록을 찾을 수 없습니다' })
  await prisma.runningRecord.update({ where: { id: r.id }, data: { deletedAt: new Date() } })
  res.json({ message: '기록이 삭제되었습니다' })
})

router.post('/import/tcx', requireAuth, upload.single('tcx'), async (req: Request, res: Response) => {
  const user = req.user as any
  if (!req.file) return res.status(400).json({ error: 'TCX 파일이 없습니다' })

  const parser = new XMLParser({ ignoreAttributes: false })
  let parsed: any
  try {
    parsed = parser.parse(req.file.buffer.toString('utf-8'))
  } catch {
    return res.status(400).json({ error: 'TCX 파싱 실패' })
  }

  const activity = parsed?.TrainingCenterDatabase?.Activities?.Activity
  if (!activity) return res.status(400).json({ error: '활동 데이터가 없습니다' })

  const laps = Array.isArray(activity.Lap) ? activity.Lap : [activity.Lap].filter(Boolean)
  if (!laps.length) return res.status(400).json({ error: '랩 데이터가 없습니다' })

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

  const step = allPts.length > 400 ? Math.floor(allPts.length / 400) + 1 : 1
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

  const r = await prisma.runningRecord.create({
    data: {
      userId: user.id, date,
      distance: distKm, duration: durSec,
      pace: calcPace(distKm, durSec),
      heartRate: avgHR, calories: totalCal,
      routeType: req.body.route_type || 'road',
      weather:   req.body.weather    || '',
      notes:     req.body.notes      || '',
      routeData: JSON.stringify(sampled),
    },
  })
  res.status(201).json({ data: withFormatted(r), message: 'TCX 기록이 추가되었습니다' })
})

export default router
