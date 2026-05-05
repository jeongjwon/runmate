import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: { marathon_id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const userId    = session.user.id
  const marathonId = Number(params.marathon_id)
  const body       = await req.json().catch(() => ({}))
  const { category } = body

  const marathon = await prisma.marathon.findUnique({ where: { id: marathonId } })
  if (!marathon) {
    return NextResponse.json({ error: '대회를 찾을 수 없습니다' }, { status: 404 })
  }

  const existing = await prisma.marathonParticipation.findFirst({
    where: { userId, marathonId, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json({ error: '이미 참가 신청한 대회입니다' }, { status: 409 })
  }

  const p = await prisma.marathonParticipation.create({
    data: { userId, marathonId, category: category || '' },
  })

  return NextResponse.json({ data: p, message: '내 마라톤에 추가되었습니다' }, { status: 201 })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { marathon_id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const userId = session.user.id
  const idParam = Number(params.marathon_id)

  // Try by participation id first, then by marathonId
  let p = await prisma.marathonParticipation.findFirst({
    where: { id: idParam, userId, deletedAt: null },
  })
  if (!p) {
    p = await prisma.marathonParticipation.findFirst({
      where: { userId, marathonId: idParam, deletedAt: null },
    })
  }
  if (!p) {
    return NextResponse.json({ error: '참가 신청을 찾을 수 없습니다' }, { status: 404 })
  }

  await prisma.marathonParticipation.delete({ where: { id: p.id } })
  return NextResponse.json({ message: '내 마라톤에서 제거되었습니다' })
}
