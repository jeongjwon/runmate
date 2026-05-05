import { NextResponse } from 'next/server'
import { crawlAndSync } from '@/src/services/crawler'

export async function POST() {
  try {
    const result = await crawlAndSync()
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
