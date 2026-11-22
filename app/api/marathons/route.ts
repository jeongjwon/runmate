import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { RaceInputError, createCustomRace, findRace, visibleMarathons } from '@/src/lib/races'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city     = searchParams.get('city')     ?? ''
  const category = searchParams.get('category') ?? ''

  const session = await getServerSession(authOptions)
  const userId  = session?.user?.id

  // 크롤링한 대회 + 내가 직접 추가한 대회만 (다른 사용자가 추가한 대회는 보이지 않음)
  const marathons = await prisma.marathon.findMany({
    where: {
      ...visibleMarathons(userId),
      ...(city     ? { city:       { contains: city } }     : {}),
      ...(category ? { categories: { contains: category } } : {}),
    },
    orderBy: { date: 'asc' },
  })

  let participationMap: Record<number, any> = {}

  if (userId) {
    const parts = await prisma.marathonParticipation.findMany({
      where: { userId, deletedAt: null },
    })
    participationMap = Object.fromEntries(parts.map(p => [p.marathonId, p]))
  }

  return NextResponse.json({ data: marathons, participationMap })
}

// 목록에 없는 대회를 직접 추가. 추가한 사람에게만 보이고, 바로 내 마라톤에 들어감
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const userId = session.user.id
  const body   = await req.json().catch(() => ({}))
  const name     = String(body.name ?? '').trim()
  const category = String(body.category ?? '').trim().slice(0, 20)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  try {
    const same = name && typeof body.date === 'string' ? await findRace(userId, name, body.date) : null
    if (same) {
      return NextResponse.json(
        { error: same.createdBy ? '이미 추가한 대회입니다' : '이미 목록에 있는 대회입니다. 대회명으로 검색해 보세요' },
        { status: 409 },
      )
    }

    const marathon = await createCustomRace(userId, {
      name,
      date:        body.date,
      location:    body.location ?? '',
      categories:  category,
      officialUrl: body.official_url ?? '',
    })
    await prisma.marathonParticipation.create({
      data: { userId, marathonId: marathon.id, category },
    })

    return NextResponse.json({ data: marathon, message: '대회가 추가되었습니다' }, { status: 201 })
  } catch (e: any) {
    if (e instanceof RaceInputError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
