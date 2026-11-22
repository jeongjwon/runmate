import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { PlanInputError, isDateStr, planView, savePlan } from '@/src/lib/plans'

// 하루 계획 저장: 없으면 생성, 있으면 넘어온 항목(kind/title/detail/done)만 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: { date: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  try {
    const plan = await savePlan(session.user.id, params.date, body)
    return NextResponse.json({ data: planView(plan), message: '계획이 저장되었습니다' })
  } catch (e) {
    if (e instanceof PlanInputError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { date: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  if (!isDateStr(params.date)) {
    return NextResponse.json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 })
  }

  await prisma.trainingPlan.deleteMany({ where: { userId: session.user.id, date: params.date } })

  return NextResponse.json({ message: '계획이 삭제되었습니다' })
}
