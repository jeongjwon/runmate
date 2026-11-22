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

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const marathon = await prisma.marathon.findUnique({ where: { id: marathonId } })
  // 다른 사용자가 직접 추가한 대회는 없는 대회로 취급
  if (!marathon || (marathon.createdBy && marathon.createdBy !== userId)) {
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

  const userId     = session.user.id
  const marathonId = Number(params.marathon_id)

  // 대회 id 로만 찾는다. 참가 id 와 섞어 찾으면 숫자가 겹칠 때 다른 대회가 지워짐
  const p = await prisma.marathonParticipation.findFirst({
    where: { userId, marathonId, deletedAt: null },
  })
  if (!p) {
    return NextResponse.json({ error: '참가 신청을 찾을 수 없습니다' }, { status: 404 })
  }

  await prisma.marathonParticipation.delete({ where: { id: p.id } })
  return NextResponse.json({ message: '내 마라톤에서 제거되었습니다' })
}
