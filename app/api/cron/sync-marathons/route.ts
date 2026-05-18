import { NextResponse } from 'next/server'
import { crawlAndSync } from '@/src/services/crawler'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await crawlAndSync()
    console.log('[cron] sync-marathons:', result.message)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[cron] sync-marathons error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
