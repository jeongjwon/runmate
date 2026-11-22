import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { listShoes } from '@/src/lib/shoes'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ data: [] })

  return NextResponse.json({ data: await listShoes(session.user.id) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 40)
  if (!name) {
    return NextResponse.json({ error: '신발 이름을 입력해주세요' }, { status: 400 })
  }

  const shoe = await prisma.shoe.create({
    data: {
      userId:  session.user.id,
      name,
      startKm: Math.max(0, Number(body.start_km) || 0),
    },
  })

  return NextResponse.json({ data: { id: shoe.id, name: shoe.name }, message: '신발이 추가되었습니다' }, { status: 201 })
}
