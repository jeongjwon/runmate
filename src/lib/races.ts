import prisma from '@/src/lib/prisma'
import { isDateStr } from '@/src/lib/plans'
import { extractCity } from '@/src/services/crawler'

// 직접 추가한 대회(marathons.created_by 가 있는 행) 공용 로직. REST API 와 MCP 도구가 같이 씀

// 이 사용자에게 보이는 대회: 크롤링한 대회 + 본인이 직접 추가한 대회
export function visibleMarathons(userId?: number | null) {
  return userId ? { OR: [{ createdBy: null }, { createdBy: userId }] } : { createdBy: null }
}

// 입력값이 잘못됐을 때 던지는 오류 (메시지를 사용자에게 그대로 보여줘도 됨)
export class RaceInputError extends Error {}

// 대회 기록·목표 시간 "시:분:초" → 초. 형식이 다르면 null
export function parseRaceTime(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{1,2}:[0-5]\d:[0-5]\d$/.test(v.trim())) return null
  const [h, m, s] = v.trim().split(':').map(Number)
  return h * 3600 + m * 60 + s
}

export function formatRaceTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 종목 이름 또는 거리(km)를 RunMate 종목 표기(5K / 10K / Half / Full)로 맞춤. 그 밖의 종목은 적은 그대로
export function eventOf(event: unknown, distanceKm?: unknown): string {
  if (typeof event === 'string' && event.trim()) {
    const e = event.trim()
    if (/풀|full|^42(\.\d+)?\s*(k|km)?$/i.test(e)) return 'Full'
    if (/하프|half|^21(\.\d+)?\s*(k|km)?$/i.test(e)) return 'Half'
    if (/^10\s*(k|km)?$/i.test(e)) return '10K'
    if (/^5\s*(k|km)?$/i.test(e)) return '5K'
    return e.slice(0, 20)
  }
  const km = Number(distanceKm)
  if (!(km > 0)) return ''
  if (Math.abs(km - 42.195) < 0.3) return 'Full'
  if (Math.abs(km - 21.0975) < 0.2) return 'Half'
  if (km === 10) return '10K'
  if (km === 5) return '5K'
  return `${Math.round(km * 10) / 10}K`
}

export interface RaceInput {
  name?: unknown
  date?: unknown
  location?: unknown
  categories?: unknown
  officialUrl?: unknown
}

// 넘어온 항목만 검증해서 marathons 컬럼 값으로 바꿈
export function raceFields(input: RaceInput) {
  const out: { name?: string; date?: string; location?: string; city?: string; categories?: string; officialUrl?: string } = {}

  if (input.name !== undefined) {
    const name = String(input.name).trim()
    if (!name) throw new RaceInputError('대회 이름을 입력해주세요')
    if (name.length > 100) throw new RaceInputError('대회 이름은 100자까지 입력할 수 있습니다')
    out.name = name
  }
  if (input.date !== undefined) {
    if (!isDateStr(input.date)) throw new RaceInputError('날짜는 YYYY-MM-DD 형식이어야 합니다')
    out.date = input.date
  }
  if (input.location !== undefined) {
    out.location = String(input.location).trim().slice(0, 100)
    out.city     = extractCity(out.location)
  }
  if (input.categories !== undefined) {
    out.categories = String(input.categories).trim().slice(0, 40)
  }
  if (input.officialUrl !== undefined) {
    const url = String(input.officialUrl).trim()
    if (url && !/^https?:\/\/\S+$/i.test(url)) throw new RaceInputError('홈페이지 주소는 http:// 또는 https:// 로 시작해야 합니다')
    out.officialUrl = url.slice(0, 300)
  }
  return out
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

// 같은 날짜에 열리는 보이는 대회 중 이름이 같은 대회.
// loose 면 한쪽 이름이 다른 쪽에 들어 있는 경우("춘천마라톤" ↔ "2026 조선일보 춘천마라톤")도 같은 대회로 봄
export async function findRace(userId: number, name: string, date: string, loose = false) {
  const sameDay = await prisma.marathon.findMany({
    where: { date, ...visibleMarathons(userId) },
    orderBy: { id: 'asc' },
  })
  const key   = norm(name)
  const exact = sameDay.find((m) => norm(m.name) === key)
  if (exact || !loose || key.length < 3) return exact ?? null
  return sameDay.find((m) => norm(m.name).length >= 3 && (norm(m.name).includes(key) || key.includes(norm(m.name)))) ?? null
}

// 사용자 전용 대회 생성. name, date 는 필수
export async function createCustomRace(userId: number, input: RaceInput) {
  const f = raceFields(input)
  if (!f.name) throw new RaceInputError('대회 이름을 입력해주세요')
  if (!f.date) throw new RaceInputError('대회 날짜를 입력해주세요')

  return prisma.marathon.create({
    data: {
      name:        f.name,
      date:        f.date,
      location:    f.location ?? '',
      city:        f.city ?? '',
      categories:  f.categories ?? '',
      officialUrl: f.officialUrl ?? '',
      createdBy:   userId,
    },
  })
}
