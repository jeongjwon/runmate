import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { isDateStr, planView } from '@/src/lib/plans'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ data: [] })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to   = searchParams.get('to')   ?? ''

  const plans = await prisma.trainingPlan.findMany({
    where: {
      userId: session.user.id,
      date: {
        ...(isDateStr(from) ? { gte: from } : {}),
        ...(isDateStr(to)   ? { lte: to }   : {}),
      },
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({ data: plans.map(planView) })
}
