import { Activity, Participation, TrainingPlan } from '@/src/types'
import { addDays, getMonday, toDateStr } from '@/src/lib/utils'

// 통계 페이지 계산 로직. 날짜는 모두 "YYYY-MM-DD" 문자열이고 today 는 브라우저(로컬) 날짜

export type StatPeriod = 'week' | 'month' | 'year' | 'all'

export const STAT_PERIODS: { key: StatPeriod; label: string }[] = [
  { key: 'week',  label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'year',  label: '올해' },
  { key: 'all',   label: '전체' },
]

export interface PeriodRange {
  from: string | null // null = 처음부터
  to: string
  // 비교 대상: 직전 기간의 "같은 시점까지". 이번 달 22일이면 지난달 1일 ~ 22일
  // 직전 기간 전체와 비교하면 진행 중인 기간이 항상 적게 나오기 때문
  prev: { from: string; to: string } | null
  prevLabel: string
}

const ymd = (y: number, m: number, d: number) => toDateStr(new Date(y, m - 1, d))
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

export function periodRange(period: StatPeriod, today: string): PeriodRange {
  const [y, m, d] = today.split('-').map(Number)

  if (period === 'week') {
    const from = toDateStr(getMonday(new Date(today + 'T00:00:00')))
    return { from, to: today, prev: { from: addDays(from, -7), to: addDays(today, -7) }, prevLabel: '지난주 같은 요일까지' }
  }
  if (period === 'month') {
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    return {
      from: ymd(y, m, 1),
      to: today,
      prev: { from: ymd(py, pm, 1), to: ymd(py, pm, Math.min(d, lastDay(py, pm))) },
      prevLabel: '지난달 같은 날까지',
    }
  }
  if (period === 'year') {
    return {
      from: ymd(y, 1, 1),
      to: today,
      prev: { from: ymd(y - 1, 1, 1), to: ymd(y - 1, m, Math.min(d, lastDay(y - 1, m))) },
      prevLabel: '작년 같은 날까지',
    }
  }
  return { from: null, to: today, prev: null, prevLabel: '' }
}

export function runsBetween(activities: Activity[], from: string | null, to: string): Activity[] {
  return activities.filter((r) => (!from || r.date >= from) && r.date <= to)
}

export interface RunTotals {
  dist: number
  sec: number
  count: number
  paceSec: number | null // 초/km. 기록이 없으면 null
}

export function totalsOf(runs: Activity[]): RunTotals {
  const dist = runs.reduce((s, r) => s + r.distance, 0)
  const sec  = runs.reduce((s, r) => s + r.duration, 0)
  return { dist, sec, count: runs.length, paceSec: dist > 0 && sec > 0 ? sec / dist : null }
}

export interface WeekStat {
  from: string // 월요일
  to: string   // 일요일
  label: string // "M/D" (월요일)
  dist: number
  count: number
  planned: number // 휴식을 뺀 계획 수. 이번 주는 오늘까지만 셈
  done: number
  rate: number | null // 계획 달성률(%). 계획이 없으면 null
  current: boolean
}

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

// 최근 n주(월~일)의 거리와 계획 달성률. 오래된 주부터, 마지막이 이번 주
export function weeklyStats(activities: Activity[], plans: TrainingPlan[], today: string, weeks = 12): WeekStat[] {
  const thisMonday = toDateStr(getMonday(new Date(today + 'T00:00:00')))
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(thisMonday, -7 * (weeks - 1 - i))
    const to   = addDays(from, 6)
    const current = from === thisMonday
    const runs = activities.filter((r) => r.date >= from && r.date <= to)
    // 휴식일은 체크하지 않는 경우가 많아 달성률에서 뺌. 이번 주는 아직 오지 않은 날의 계획도 뺌
    const due  = plans.filter((p) => p.kind !== 'rest' && p.date >= from && p.date <= (current ? today : to))
    const done = due.filter((p) => p.done).length
    return {
      from,
      to,
      label: md(from),
      dist: runs.reduce((s, r) => s + r.distance, 0),
      count: runs.length,
      planned: due.length,
      done,
      rate: due.length ? Math.round((done / due.length) * 100) : null,
      current,
    }
  })
}

// ── 종목별 최고 기록 ──────────────────────────────────────

export const PB_EVENTS = [
  { key: '5K',   label: '5K',  km: 5 },
  { key: '10K',  label: '10K', km: 10 },
  { key: 'Half', label: '하프', km: 21.0975 },
  { key: 'Full', label: '풀',   km: 42.195 },
] as const

// 러닝 기록은 GPS 오차를 감안해 종목 거리의 -2% ~ +5% 까지 그 종목으로 봄
export const PB_MIN_RATIO = 0.98
export const PB_MAX_RATIO = 1.05

export interface DistancePB {
  seconds: number
  date: string
  source: 'race' | 'run' // 내 마라톤의 완주 기록 / 러닝 기록
  name: string           // 대회 이름 (러닝 기록이면 빈 문자열)
  distance: number       // 대회는 종목 거리, 러닝 기록은 실제 달린 거리
}

// "H:MM:SS" · "M:SS" → 초. 형식이 다르면 0
function toSeconds(v: string | null | undefined): number {
  if (!v || !/^\d{1,2}(:\d{2}){1,2}$/.test(v)) return 0
  return v.split(':').map(Number).reduce((s, n) => s * 60 + n, 0)
}

export function distancePBs(
  activities: Activity[],
  participations: Participation[],
): Record<(typeof PB_EVENTS)[number]['key'], DistancePB | null> {
  const out = {} as Record<(typeof PB_EVENTS)[number]['key'], DistancePB | null>
  for (const ev of PB_EVENTS) {
    const candidates: DistancePB[] = []
    for (const p of participations) {
      const seconds = toSeconds(p.finishTime)
      if (seconds > 0 && p.category?.trim().toLowerCase() === ev.key.toLowerCase()) {
        candidates.push({ seconds, date: p.marathon.date, source: 'race', name: p.marathon.name, distance: ev.km })
      }
    }
    for (const r of activities) {
      if (r.duration > 0 && r.distance >= ev.km * PB_MIN_RATIO && r.distance <= ev.km * PB_MAX_RATIO) {
        candidates.push({ seconds: r.duration, date: r.date, source: 'run', name: '', distance: r.distance })
      }
    }
    // 시간이 같으면 대회 기록을 앞에
    candidates.sort((a, b) => a.seconds - b.seconds || (a.source === 'race' ? -1 : 1))
    out[ev.key] = candidates[0] ?? null
  }
  return out
}

// 가장 빠른 평균 페이스. 짧은 기록(전력 질주 1km 등)이 뽑히지 않도록 minKm 이상만 봄
export function bestPaceRun(activities: Activity[], minKm = 5): Activity | null {
  let best: Activity | null = null
  for (const r of activities) {
    if (r.distance < minKm || r.duration <= 0) continue
    if (!best || r.duration / r.distance < best.duration / best.distance) best = r
  }
  return best
}
