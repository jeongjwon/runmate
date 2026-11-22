import prisma from '@/src/lib/prisma'

export const PLAN_KINDS = ['run', 'strength', 'both', 'rest'] as const
export type PlanKind = (typeof PLAN_KINDS)[number]

const KIND_TITLE: Record<PlanKind, string> = {
  run: '러닝',
  strength: '근력',
  both: '러닝 + 근력',
  rest: '휴식',
}

export function isPlanKind(v: unknown): v is PlanKind {
  return typeof v === 'string' && (PLAN_KINDS as readonly string[]).includes(v)
}

// "YYYY-MM-DD" 형식이면서 실제 존재하는 날짜인지 확인
export function isDateStr(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

// 서버(UTC)에서도 한국 날짜 기준으로 "오늘"을 구함
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 해당 날짜가 속한 주의 월요일
export function mondayOf(date: string): string {
  const day = new Date(date + 'T00:00:00Z').getUTCDay()
  return shiftDate(date, day === 0 ? -6 : 1 - day)
}

export interface PlanInput {
  kind?: unknown
  title?: unknown
  detail?: unknown
  done?: unknown
}

// 입력값이 잘못됐을 때 던지는 오류 (메시지를 사용자에게 그대로 보여줘도 됨)
export class PlanInputError extends Error {}

// 하루 계획 저장(없으면 생성, 있으면 넘어온 항목만 수정). 입력이 잘못되면 PlanInputError
export async function savePlan(userId: number, date: string, input: PlanInput) {
  if (!isDateStr(date)) throw new PlanInputError('날짜는 YYYY-MM-DD 형식이어야 합니다')
  if (input.kind !== undefined && !isPlanKind(input.kind)) {
    throw new PlanInputError('kind 는 run, strength, both, rest 중 하나여야 합니다')
  }

  const title  = typeof input.title  === 'string' ? input.title.trim().slice(0, 100)  : undefined
  const detail = typeof input.detail === 'string' ? input.detail.trim().slice(0, 500) : undefined
  const done   = typeof input.done   === 'boolean' ? input.done : undefined

  const existing = await prisma.trainingPlan.findUnique({ where: { userId_date: { userId, date } } })

  if (!existing) {
    if (!input.kind) throw new PlanInputError('새 계획에는 kind 가 필요합니다')
    return prisma.trainingPlan.create({
      data: {
        userId,
        date,
        kind:   input.kind,
        title:  title || KIND_TITLE[input.kind],
        detail: detail ?? '',
        done:   done ?? false,
      },
    })
  }

  const kind = (input.kind ?? existing.kind) as PlanKind
  return prisma.trainingPlan.update({
    where: { id: existing.id },
    data: {
      kind,
      ...(title  !== undefined ? { title: title || KIND_TITLE[kind] } : {}),
      ...(detail !== undefined ? { detail } : {}),
      ...(done   !== undefined ? { done }   : {}),
    },
  })
}

export function planView(p: { id: number; date: string; kind: string; title: string; detail: string; done: boolean }) {
  return { id: p.id, date: p.date, kind: p.kind, title: p.title, detail: p.detail, done: p.done }
}
