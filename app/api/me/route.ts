import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/src/lib/auth'
import prisma from '@/src/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ user: null })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, picture: true, provider: true },
  })

  return NextResponse.json({ user })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { userId } })
    await tx.userBadge.deleteMany({ where: { userId } })
    await tx.activity.deleteMany({ where: { userId } })
    await tx.marathonParticipation.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })
  })

  return NextResponse.json({ ok: true })
}
