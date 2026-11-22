import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

// 연결 해제: 이 연결로 발급된 토큰은 즉시 쓸 수 없게 됨
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { count } = await prisma.mcpGrant.deleteMany({
    where: { id: Number(params.id) || 0, userId: session.user.id },
  })
  if (!count) return NextResponse.json({ error: '연결을 찾을 수 없습니다' }, { status: 404 })

  return NextResponse.json({ message: '연결이 해제되었습니다' })
}
