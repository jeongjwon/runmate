import { Router, Request, Response } from 'express'
import prisma from '../db'
import { crawlAndSync } from '../services/crawler'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { city, category } = req.query as Record<string, string>

  const marathons = await prisma.marathon.findMany({
    where: {
      ...(city ? { city: { contains: city } } : {}),
      ...(category ? { categories: { contains: category } } : {}),
    },
    orderBy: { date: 'asc' },
  })

  const userId = (req.user as any)?.id
  let participationMap: Record<number, any> = {}

  if (userId) {
    const parts = await prisma.marathonParticipation.findMany({
      where: { userId, deletedAt: null },
    })
    participationMap = Object.fromEntries(parts.map(p => [p.marathonId, p]))
  }

  res.json({ data: marathons, participationMap })
})

router.get('/:id', async (req: Request, res: Response) => {
  const marathon = await prisma.marathon.findUnique({
    where: { id: Number(req.params.id) },
    include: { participations: { where: { deletedAt: null } } },
  })
  if (!marathon) return res.status(404).json({ error: '대회를 찾을 수 없습니다' })
  res.json({ data: marathon })
})

router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const result = await crawlAndSync()
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
