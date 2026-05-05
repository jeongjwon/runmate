import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import prisma from '../db'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), '../static/uploads/certificates')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const uid = (req.user as any).id
    const mid = req.params.marathon_id
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${uid}_${mid}_${Date.now()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(
      path.extname(file.originalname).toLowerCase()
    )
    cb(null, ok)
  },
})

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = (req.user as any).id
  const parts = await prisma.marathonParticipation.findMany({
    where: { userId, deletedAt: null },
    include: { marathon: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ data: parts.map(withFormattedTime) })
})

router.post('/:marathon_id', requireAuth, async (req: Request, res: Response) => {
  const userId    = (req.user as any).id
  const marathonId = Number(req.params.marathon_id)
  const { category } = req.body

  const marathon = await prisma.marathon.findUnique({ where: { id: marathonId } })
  if (!marathon) return res.status(404).json({ error: '대회를 찾을 수 없습니다' })

  const existing = await prisma.marathonParticipation.findFirst({
    where: { userId, marathonId, deletedAt: null },
  })
  if (existing) return res.status(409).json({ error: '이미 참가 신청한 대회입니다' })

  const p = await prisma.marathonParticipation.create({
    data: { userId, marathonId, category: category || '' },
  })
  res.status(201).json({ data: p, message: '내 마라톤에 추가되었습니다' })
})

router.delete('/:marathon_id', requireAuth, async (req: Request, res: Response) => {
  const userId    = (req.user as any).id
  const marathonId = Number(req.params.marathon_id)

  const p = await prisma.marathonParticipation.findFirst({
    where: { userId, marathonId, deletedAt: null },
  })
  if (!p) return res.status(404).json({ error: '참가 신청을 찾을 수 없습니다' })

  await prisma.marathonParticipation.delete({ where: { id: p.id } })
  res.json({ message: '내 마라톤에서 제거되었습니다' })
})

router.put('/:marathon_id/record', requireAuth, async (req: Request, res: Response) => {
  const userId    = (req.user as any).id
  const marathonId = Number(req.params.marathon_id)
  const { category, finish_time, race_notes } = req.body

  const p = await prisma.marathonParticipation.findFirst({
    where: { userId, marathonId, deletedAt: null },
  })
  if (!p) return res.status(404).json({ error: '참가 신청을 찾을 수 없습니다' })

  const finishTimeSec = finish_time ? parseDuration(finish_time) : undefined

  const updated = await prisma.marathonParticipation.update({
    where: { id: p.id },
    data: {
      ...(category !== undefined ? { category } : {}),
      ...(finishTimeSec !== undefined ? { finishTime: finishTimeSec } : {}),
      ...(race_notes !== undefined ? { raceNotes: race_notes } : {}),
    },
  })
  res.json({ data: withFormattedTime(updated), message: '기록이 저장되었습니다' })
})

router.post(
  '/:marathon_id/certificate',
  requireAuth,
  upload.single('certificate'),
  async (req: Request, res: Response) => {
    const userId    = (req.user as any).id
    const marathonId = Number(req.params.marathon_id)

    const p = await prisma.marathonParticipation.findFirst({
      where: { userId, marathonId, deletedAt: null },
    })
    if (!p) return res.status(404).json({ error: '참가 신청을 찾을 수 없습니다' })

    if (!req.file) return res.status(400).json({ error: '파일이 없습니다' })

    if (p.certificateUrl) {
      const old = path.join(process.cwd(), '../static', p.certificateUrl)
      if (fs.existsSync(old)) fs.unlinkSync(old)
    }

    const url = `/uploads/certificates/${req.file.filename}`
    const updated = await prisma.marathonParticipation.update({
      where: { id: p.id },
      data: { certificateUrl: url },
    })
    res.json({ data: updated, message: '기록증이 업로드되었습니다', url })
  }
)

export default router
