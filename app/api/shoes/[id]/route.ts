import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'
import { findShoeByName, shoeText } from '@/src/lib/shoes'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const shoe = await prisma.shoe.findFirst({ where: { id: Number(params.id) || 0, userId: session.user.id } })
  if (!shoe) return NextResponse.json({ error: '신발을 찾을 수 없습니다' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 40) : undefined
  if (name === '') {
    return NextResponse.json({ error: '신발 이름을 입력해주세요' }, { status: 400 })
  }
  if (name !== undefined) {
    const same = await findShoeByName(session.user.id, name)
    if (same && same.id !== shoe.id) {
      return NextResponse.json({ error: '같은 이름의 신발이 이미 있습니다' }, { status: 409 })
    }
  }

  await prisma.shoe.update({
    where: { id: shoe.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(body.brand   !== undefined ? { brand:   shoeText(body.brand) }       : {}),
      ...(body.model   !== undefined ? { model:   shoeText(body.model) }       : {}),
      ...(body.purpose !== undefined ? { purpose: shoeText(body.purpose, 60) } : {}),
      ...(body.start_km !== undefined ? { startKm: Math.max(0, Number(body.start_km) || 0) } : {}),
      // 은퇴 처리한 신발은 기록 폼 선택지에서 빠지고, 누적 거리는 그대로 남음
      ...(body.retired !== undefined ? { retiredAt: body.retired ? (shoe.retiredAt ?? new Date()) : null } : {}),
    },
  })

  return NextResponse.json({ message: '신발이 수정되었습니다' })
}

// 신발을 지우면 그 신발로 저장했던 기록은 남고, 기록의 신발 표시만 비워짐
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const shoe = await prisma.shoe.findFirst({ where: { id: Number(params.id) || 0, userId: session.user.id } })
  if (!shoe) return NextResponse.json({ error: '신발을 찾을 수 없습니다' }, { status: 404 })

  await prisma.shoe.delete({ where: { id: shoe.id } })

  return NextResponse.json({ message: '신발이 삭제되었습니다' })
}
