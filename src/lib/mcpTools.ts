import prisma from '@/src/lib/prisma'
import { syncMonthlyKmBadges } from '@/src/lib/syncBadges'
import { listShoes } from '@/src/lib/shoes'
import { isDateStr, kstToday, mondayOf, planView, savePlan, shiftDate } from '@/src/lib/plans'

// Claude 커넥터(MCP)에 노출하는 도구 정의와 실행부.
// 도구 설명은 Claude 가 읽고 호출 여부를 정하므로 입력 형식을 구체적으로 적는다.

const RUN_TYPES = ['easy', 'long', 'tempo', 'interval', 'race']
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }

const PLAN_ITEM = {
  type: 'object',
  properties: {
    date:   { ...DATE, description: '계획 날짜 (YYYY-MM-DD, 한국 시간)' },
    kind:   { type: 'string', enum: ['run', 'strength', 'both', 'rest'], description: 'run=러닝, strength=근력, both=러닝+근력, rest=휴식' },
    title:  { type: 'string', description: '한 줄 제목. 예: "이지런 6km", "인터벌 1km × 5", "하체 근력"' },
    detail: { type: 'string', description: '세부 내용(선택). 예: "페이스 6\'00\", 회복 조깅 2분"' },
    done:   { type: 'boolean', description: '완료 여부(선택). 생략하면 새 계획은 미완료, 기존 계획은 그대로' },
  },
  required: ['date', 'kind', 'title'],
  additionalProperties: false,
}

export const TOOLS = [
  {
    name: 'get_overview',
    title: '러닝 현황 요약',
    description:
      '오늘 날짜(한국 시간), 이번 주 훈련 계획과 달린 거리, 최근 8주 주간 거리, 다가오는 참가 대회, 신발별 누적 거리를 한 번에 돌려줍니다. 훈련 계획을 짜거나 조언하기 전에 먼저 호출하세요.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: '러닝 현황 요약', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_runs',
    title: '러닝 기록 조회',
    description: '기간 안의 러닝 기록(거리, 시간, 페이스, 심박, 훈련 종류, 신발, 메모)을 날짜순으로 돌려줍니다. 기간을 생략하면 최근 30일입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE, description: '시작 날짜 (포함)' },
        to:   { ...DATE, description: '끝 날짜 (포함)' },
      },
      additionalProperties: false,
    },
    annotations: { title: '러닝 기록 조회', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'add_run',
    title: '러닝 기록 추가',
    description:
      '러닝 기록 1건을 RunMate에 저장합니다. 사용자가 달린 내용을 알려주고 기록해 달라고 했을 때만 사용하세요. 같은 날짜·거리·시간의 기록이 이미 있으면 새로 만들지 않습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        date:           { ...DATE, description: '달린 날짜 (YYYY-MM-DD, 한국 시간)' },
        distance_km:    { type: 'number', exclusiveMinimum: 0, description: '거리 (km)' },
        duration:       { type: 'string', pattern: '^\\d{1,2}(:\\d{2}){1,2}$', description: '운동 시간. "분:초" 또는 "시:분:초". 예: "52:30", "1:45:10"' },
        avg_heart_rate: { type: 'integer', minimum: 0, description: '평균 심박 (bpm, 선택)' },
        max_heart_rate: { type: 'integer', minimum: 0, description: '최고 심박 (bpm, 선택)' },
        run_type:       { type: 'string', enum: RUN_TYPES, description: 'easy=이지런, long=롱런, tempo=지속주, interval=인터벌, race=대회 (선택)' },
        shoe:           { type: 'string', description: '신은 신발 이름(선택). get_overview 의 shoes 에 있는 이름과 같아야 합니다' },
        notes:          { type: 'string', description: '메모 (선택)' },
      },
      required: ['date', 'distance_km', 'duration'],
      additionalProperties: false,
    },
    annotations: { title: '러닝 기록 추가', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_plans',
    title: '훈련 계획 조회',
    description: '기간 안의 훈련 계획을 날짜순으로 돌려줍니다. 기간을 생략하면 이번 주 월요일부터 다음 주 일요일까지입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE, description: '시작 날짜 (포함)' },
        to:   { ...DATE, description: '끝 날짜 (포함)' },
      },
      additionalProperties: false,
    },
    annotations: { title: '훈련 계획 조회', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'save_plans',
    title: '훈련 계획 저장',
    description:
      '훈련 계획을 날짜별로 저장합니다. 하루에 계획은 하나이며, 같은 날짜에 이미 계획이 있으면 새 내용으로 덮어씁니다. 한 주 계획은 7일치를 한 번에 보내세요. 저장한 계획은 RunMate 활동 캘린더와 "이번 주 훈련"에 표시됩니다.',
    inputSchema: {
      type: 'object',
      properties: { plans: { type: 'array', items: PLAN_ITEM, minItems: 1, maxItems: 62 } },
      required: ['plans'],
      additionalProperties: false,
    },
    annotations: { title: '훈련 계획 저장', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'set_plan_done',
    title: '훈련 계획 완료 표시',
    description: '해당 날짜 계획의 완료 여부를 바꿉니다.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { ...DATE, description: '계획 날짜' },
        done: { type: 'boolean', description: 'true=완료, false=미완료' },
      },
      required: ['date', 'done'],
      additionalProperties: false,
    },
    annotations: { title: '훈련 계획 완료 표시', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'delete_plan',
    title: '훈련 계획 삭제',
    description: '해당 날짜의 훈련 계획을 삭제합니다. 휴식일로 바꾸려는 것이라면 삭제하지 말고 save_plans 에 kind=rest 로 저장하세요.',
    inputSchema: {
      type: 'object',
      properties: { date: { ...DATE, description: '삭제할 계획 날짜' } },
      required: ['date'],
      additionalProperties: false,
    },
    annotations: { title: '훈련 계획 삭제', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
]

// 잘못된 입력처럼 Claude 가 고쳐서 다시 시도할 수 있는 오류
export class ToolError extends Error {}

function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '-'
  const spk = durSec / distKm
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

function parseDuration(s: string): number {
  const parts = s.split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

function runView(r: any, shoeNames: Map<number, string>) {
  return {
    id:             r.id,
    date:           r.date,
    distance_km:    round2(r.distance),
    duration:       formatDuration(r.duration),
    pace_per_km:    calcPace(r.distance, r.duration),
    avg_heart_rate: r.heartRate || null,
    max_heart_rate: r.maxHeartRate || null,
    run_type:       r.runType || null,
    shoe:           (r.shoeId && shoeNames.get(r.shoeId)) || null,
    notes:          r.notes || null,
  }
}

function range(args: any, defFrom: string, defTo: string) {
  const from = args.from ?? defFrom
  const to   = args.to   ?? defTo
  if (!isDateStr(from) || !isDateStr(to)) throw new ToolError('from, to 는 YYYY-MM-DD 형식이어야 합니다')
  if (from > to) throw new ToolError('from 이 to 보다 늦습니다')
  return { from, to }
}

async function getOverview(userId: number) {
  const today     = kstToday()
  const weekStart = mondayOf(today)
  const weekEnd   = shiftDate(weekStart, 6)
  const since     = shiftDate(weekStart, -7 * 7) // 이번 주 포함 8주

  const [runs, plans, parts, shoes] = await Promise.all([
    prisma.activity.findMany({
      where: { userId, deletedAt: null, date: { gte: since, lte: weekEnd } },
      select: { date: true, distance: true },
    }),
    prisma.trainingPlan.findMany({ where: { userId, date: { gte: weekStart, lte: weekEnd } }, orderBy: { date: 'asc' } }),
    prisma.marathonParticipation.findMany({ where: { userId, deletedAt: null }, include: { marathon: true } }),
    listShoes(userId),
  ])

  const weekly = Array.from({ length: 8 }, (_, i) => ({ week_start: shiftDate(since, i * 7), km: 0, runs: 0 }))
  runs.forEach((r) => {
    const w = weekly.find((x) => x.week_start === mondayOf(r.date))
    if (w) {
      w.km += r.distance
      w.runs += 1
    }
  })
  weekly.forEach((w) => (w.km = round2(w.km)))

  const races = parts
    .map((p) => ({
      name:     p.marathon.name,
      date:     p.marathon.date.replace(/\./g, '-').slice(0, 10),
      category: p.category || null,
    }))
    .filter((r) => isDateStr(r.date) && r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ...r, days_left: Math.round((Date.parse(r.date) - Date.parse(today)) / 86400000) }))

  return {
    today,
    weekday: ['일', '월', '화', '수', '목', '금', '토'][new Date(today + 'T00:00:00Z').getUTCDay()] + '요일',
    this_week: {
      from: weekStart,
      to: weekEnd,
      run_km: weekly[7].km,
      run_count: weekly[7].runs,
      plans: plans.map(planView),
    },
    weekly_km: weekly,
    upcoming_races: races,
    shoes: shoes.map((s) => ({ name: s.name, km: s.km, runs: s.runs, retired: s.retired })),
  }
}

async function listRuns(userId: number, args: any) {
  const today = kstToday()
  const { from, to } = range(args, shiftDate(today, -29), today)
  const [runs, shoes] = await Promise.all([
    prisma.activity.findMany({
      where: { userId, deletedAt: null, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 400,
    }),
    prisma.shoe.findMany({ where: { userId }, select: { id: true, name: true } }),
  ])
  const names = new Map(shoes.map((s) => [s.id, s.name]))
  return {
    from,
    to,
    count: runs.length,
    total_km: round2(runs.reduce((s, r) => s + r.distance, 0)),
    runs: runs.map((r) => runView(r, names)),
  }
}

async function addRun(userId: number, args: any) {
  const { date } = args
  const dist = Number(args.distance_km)
  const durSec = parseDuration(String(args.duration ?? ''))
  if (!isDateStr(date)) throw new ToolError('date 는 YYYY-MM-DD 형식이어야 합니다')
  if (!(dist > 0) || dist > 500) throw new ToolError('distance_km 는 0보다 큰 km 값이어야 합니다')
  if (durSec <= 0) throw new ToolError('duration 은 "분:초" 또는 "시:분:초" 형식이어야 합니다 (예: "52:30")')
  if (args.run_type !== undefined && !RUN_TYPES.includes(args.run_type)) {
    throw new ToolError(`run_type 은 ${RUN_TYPES.join(', ')} 중 하나여야 합니다`)
  }

  const shoes = await prisma.shoe.findMany({ where: { userId }, select: { id: true, name: true } })
  const names = new Map(shoes.map((s) => [s.id, s.name]))
  let shoeId: number | null = null
  if (args.shoe) {
    const wanted = String(args.shoe).trim().toLowerCase()
    const shoe = shoes.find((s) => s.name.toLowerCase() === wanted)
    if (!shoe) {
      throw new ToolError(
        shoes.length
          ? `"${args.shoe}" 신발이 없습니다. 등록된 신발: ${shoes.map((s) => s.name).join(', ')}`
          : '등록된 신발이 없습니다. shoe 없이 저장하거나, RunMate에서 신발을 먼저 추가하세요',
      )
    }
    shoeId = shoe.id
  }

  // TCX 임포트와 같은 기준으로 중복 확인 (같은 날짜·시간, 거리 ±5m)
  const existing = await prisma.activity.findFirst({
    where: { userId, deletedAt: null, date, duration: durSec, distance: { gte: dist - 0.005, lte: dist + 0.005 } },
  })
  if (existing) return { saved: false, duplicate: true, message: '같은 기록이 이미 있습니다', run: runView(existing, names) }

  const run = await prisma.activity.create({
    data: {
      userId,
      date,
      distance:     dist,
      duration:     durSec,
      pace:         calcPace(dist, durSec),
      paceSeconds:  Math.round(durSec / dist),
      heartRate:    Number(args.avg_heart_rate) || 0,
      maxHeartRate: Number(args.max_heart_rate) || 0,
      runType:      args.run_type ?? '',
      notes:        String(args.notes ?? '').slice(0, 2000),
      shoeId,
    },
  })
  await syncMonthlyKmBadges(userId).catch(() => {})

  return { saved: true, run: runView(run, names) }
}

async function listPlans(userId: number, args: any) {
  const weekStart = mondayOf(kstToday())
  const { from, to } = range(args, weekStart, shiftDate(weekStart, 13))
  const plans = await prisma.trainingPlan.findMany({
    where: { userId, date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  })
  return { from, to, plans: plans.map(planView) }
}

async function savePlans(userId: number, args: any) {
  const items = args.plans
  if (!Array.isArray(items) || items.length === 0) throw new ToolError('plans 배열이 필요합니다')
  if (items.length > 62) throw new ToolError('한 번에 62일치까지 저장할 수 있습니다')

  // 일부만 저장되는 일이 없도록 저장 전에 전부 검사
  const seen = new Set<string>()
  items.forEach((p: any, i: number) => {
    if (!isDateStr(p?.date)) throw new ToolError(`plans[${i}].date 는 YYYY-MM-DD 형식이어야 합니다`)
    if (!['run', 'strength', 'both', 'rest'].includes(p.kind)) {
      throw new ToolError(`plans[${i}].kind 는 run, strength, both, rest 중 하나여야 합니다`)
    }
    if (seen.has(p.date)) throw new ToolError(`${p.date} 계획이 두 번 들어 있습니다. 하루에 계획은 하나입니다`)
    seen.add(p.date)
  })

  const saved = []
  for (const p of items) {
    saved.push(planView(await savePlan(userId, p.date, { kind: p.kind, title: p.title ?? '', detail: p.detail ?? '', done: p.done })))
  }
  return { saved: saved.length, plans: saved }
}

async function setPlanDone(userId: number, args: any) {
  if (!isDateStr(args.date)) throw new ToolError('date 는 YYYY-MM-DD 형식이어야 합니다')
  if (typeof args.done !== 'boolean') throw new ToolError('done 은 true 또는 false 여야 합니다')
  const plan = await prisma.trainingPlan.findUnique({ where: { userId_date: { userId, date: args.date } } })
  if (!plan) throw new ToolError(`${args.date} 에는 계획이 없습니다`)
  const updated = await prisma.trainingPlan.update({ where: { id: plan.id }, data: { done: args.done } })
  return { plan: planView(updated) }
}

async function deletePlan(userId: number, args: any) {
  if (!isDateStr(args.date)) throw new ToolError('date 는 YYYY-MM-DD 형식이어야 합니다')
  const { count } = await prisma.trainingPlan.deleteMany({ where: { userId, date: args.date } })
  return { deleted: count > 0, date: args.date }
}

const HANDLERS: Record<string, (userId: number, args: any) => Promise<unknown>> = {
  get_overview:  getOverview,
  list_runs:     listRuns,
  add_run:       addRun,
  list_plans:    listPlans,
  save_plans:    savePlans,
  set_plan_done: setPlanDone,
  delete_plan:   deletePlan,
}

export function hasTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name)
}

export async function callTool(userId: number, name: string, args: unknown): Promise<unknown> {
  return HANDLERS[name](userId, args && typeof args === 'object' ? args : {})
}
