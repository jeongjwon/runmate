import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { crawlAndSync } from '@/src/services/crawler'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city     = searchParams.get('city')     ?? ''
  const category = searchParams.get('category') ?? ''

  const count = await prisma.marathon.count()
  if (count === 0) {
    try { await crawlAndSync() } catch {}
  }

  const marathons = await prisma.marathon.findMany({
    where: {
      ...(city     ? { city:       { contains: city } }     : {}),
      ...(category ? { categories: { contains: category } } : {}),
    },
    orderBy: { date: 'asc' },
  })

  const session = await getServerSession(authOptions)
  const userId  = session?.user?.id
  let participationMap: Record<number, any> = {}

  if (userId) {
    const parts = await prisma.marathonParticipation.findMany({
      where: { userId, deletedAt: null },
    })
    participationMap = Object.fromEntries(parts.map(p => [p.marathonId, p]))
  }

  return NextResponse.json({ data: marathons, participationMap })
}
