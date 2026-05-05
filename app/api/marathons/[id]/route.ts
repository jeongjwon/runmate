import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/src/lib/prisma'

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

  return NextResponse.json({ data: marathon })
}
