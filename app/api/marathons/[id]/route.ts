import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { RaceInputError, raceFields } from '@/src/lib/races'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const marathon = await prisma.marathon.findUnique({
    where: { id: Number(params.id) },
    include: { participations: { where: { deletedAt: null } } },
  })

  if (!marathon) {
    return NextResponse.json({ error: '대회를 찾을 수 없습니다' }, { status: 404 })
  }

  // 직접 추가한 대회는 추가한 사람에게만 보임
  if (marathon.createdBy) {
    const session = await getServerSession(authOptions)
    if (session?.user?.id !== marathon.createdBy) {
      return NextResponse.json({ error: '대회를 찾을 수 없습니다' }, { status: 404 })
    }
  }

  return NextResponse.json({ data: marathon })
}

// 직접 추가한 대회만, 추가한 본인만 수정·삭제 가능. 크롤링한 대회는 대상이 아님
async function findOwnRace(id: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) }
  }
  const marathon = await prisma.marathon.findFirst({
    where: { id: Number(id) || 0, createdBy: session.user.id },
  })
  if (!marathon) {
    return { error: NextResponse.json({ error: '대회를 찾을 수 없습니다' }, { status: 404 }) }
  }
  return { marathon, userId: session.user.id }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const found = await findOwnRace(params.id)
  if (found.error) return found.error
  const { marathon, userId } = found

  const body = await req.json().catch(() => ({}))
  const category = body.category !== undefined ? String(body.category).trim().slice(0, 20) : undefined

  let fields
  try {
    fields = raceFields({
      name:        body.name,
      date:        body.date,
      location:    body.location,
      categories:  category,
      officialUrl: body.official_url,
    })
  } catch (e: any) {
    if (e instanceof RaceInputError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }

  const updated = await prisma.marathon.update({ where: { id: marathon.id }, data: fields })
  // 직접 추가한 대회는 종목이 곧 내 참가 종목
  if (category !== undefined) {
    await prisma.marathonParticipation.updateMany({
      where: { userId, marathonId: marathon.id },
      data:  { category },
    })
  }

  return NextResponse.json({ data: updated, message: '대회가 수정되었습니다' })
}

// 대회를 지우면 내 마라톤의 참가 정보(완주 기록 포함)도 함께 지워짐
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const found = await findOwnRace(params.id)
  if (found.error) return found.error
  const { marathon } = found

  await prisma.$transaction([
    prisma.marathonParticipation.deleteMany({ where: { marathonId: marathon.id } }),
    prisma.marathon.delete({ where: { id: marathon.id } }),
  ])

  return NextResponse.json({ message: '대회가 삭제되었습니다' })
}
