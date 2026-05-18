import { NextResponse } from 'next/server'
import { crawlAndSync } from '@/src/services/crawler'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  console.log(`[cron] sync-marathons started at ${startedAt}`)

  try {
    const t0 = Date.now()
    const result = await crawlAndSync()
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2)

    console.log(
      `[cron] sync-marathons done | added=${result.added} updated=${result.updated} elapsed=${elapsed}s`,
    )
    return NextResponse.json({ ...result, startedAt, elapsed: `${elapsed}s` })
  } catch (e: any) {
    console.error(`[cron] sync-marathons failed at ${startedAt} | error=${e.message}`)
    return NextResponse.json({ error: e.message, startedAt }, { status: 500 })
  }
}
