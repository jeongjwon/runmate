import { Prisma } from '@prisma/client'
import prisma from '@/src/lib/prisma'
import { syncMonthlyKmBadges } from '@/src/lib/syncBadges'
import { listShoes, shoeText } from '@/src/lib/shoes'
import { isDateStr, kstToday, mondayOf, planView, savePlan, shiftDate } from '@/src/lib/plans'
import { cleanExternalId, deletedRun, findDuplicateRun, matchRun } from '@/src/lib/runs'
import { RaceInputError, createCustomRace, eventOf, findRace, formatRaceTime, parseRaceTime, raceFields } from '@/src/lib/races'

// Claude 커넥터(MCP)에 노출하는 도구 정의와 실행부.
// 도구 설명은 Claude 가 읽고 호출 여부를 정하므로 입력 형식을 구체적으로 적는다.

const RUN_TYPES = ['easy', 'long', 'tempo', 'interval', 'race']
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const DURATION  = { type: 'string', pattern: '^\\d{1,2}(:\\d{2}){1,2}$' }
const RACE_TIME = { type: 'string', pattern: '^\\d{1,2}:\\d{2}:\\d{2}$' }
const IMPORT_MAX = 200

const IMPORT_ITEM = {
  type: 'object',
  properties: {
    external_id:    { type: 'string', maxLength: 100, description: '워치·앱이 붙인 활동 고유 ID. TCX 는 Activity 의 Id 값 그대로 넣습니다. 예: "2026-10-03T00:03:06Z". 같은 ID 의 기록은 한 번만 저장됩니다. 원본에 없으면 생략하고, 지어내지 마세요' },
    date:           { ...DATE, description: '달린 날짜 (YYYY-MM-DD, 한국 시간). 원본이 UTC 시각이면 9시간을 더한 날짜입니다. 예: "2026-10-02T16:03:06Z" → "2026-10-03"' },
    distance_km:    { type: 'number', exclusiveMinimum: 0, description: '거리 (km)' },
    duration:       { ...DURATION, description: '이동 시간(정지 시간 제외). "분:초" 또는 "시:분:초". 예: "52:30", "1:45:10". 페이스는 이 값으로 계산합니다' },
    elapsed:        { ...DURATION, description: '총 경과 시간(정지 시간 포함, 선택). duration 보다 짧을 수 없습니다' },
    avg_heart_rate: { type: 'integer', minimum: 0, description: '평균 심박 (bpm, 선택)' },
    max_heart_rate: { type: 'integer', minimum: 0, description: '최고 심박 (bpm, 선택)' },
    run_type:       { type: 'string', enum: RUN_TYPES, description: 'easy=이지런, long=롱런, tempo=지속주, interval=인터벌, race=대회 (선택)' },
    shoe:           { type: 'string', description: '신은 신발 이름(선택). list_shoes 에 있는 이름과 같아야 합니다' },
    notes:          { type: 'string', description: '메모 (선택)' },
  },
  required: ['date', 'distance_km', 'duration'],
  additionalProperties: false,
}

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
    description:
      '기간 안의 러닝 기록(거리, 시간, 페이스, 심박, 훈련 종류, 신발, 메모)을 날짜순으로 돌려줍니다. 기간을 생략하면 최근 30일입니다. duration 은 정지 시간을 뺀 이동 시간, elapsed 는 총 경과 시간(모르면 null)입니다.',
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
      '러닝 기록 1건을 RunMate에 저장합니다. 사용자가 달린 내용을 알려주고 기록해 달라고 했을 때만 사용하세요. 같은 날짜에 거리 차이가 100m 이내인 기록이 이미 있으면 새로 만들지 않습니다. 여러 건을 한 번에 넣을 때는 import_runs 를 쓰세요.',
    inputSchema: {
      type: 'object',
      properties: {
        date:           { ...DATE, description: '달린 날짜 (YYYY-MM-DD, 한국 시간)' },
        distance_km:    { type: 'number', exclusiveMinimum: 0, description: '거리 (km)' },
        duration:       { ...DURATION, description: '운동 시간(정지 시간을 뺀 이동 시간). "분:초" 또는 "시:분:초". 예: "52:30", "1:45:10"' },
        avg_heart_rate: { type: 'integer', minimum: 0, description: '평균 심박 (bpm, 선택)' },
        max_heart_rate: { type: 'integer', minimum: 0, description: '최고 심박 (bpm, 선택)' },
        run_type:       { type: 'string', enum: RUN_TYPES, description: 'easy=이지런, long=롱런, tempo=지속주, interval=인터벌, race=대회 (선택)' },
        shoe:           { type: 'string', description: '신은 신발 이름(선택). get_overview 의 shoes 에 있는 이름과 같아야 합니다. 없는 신발이면 add_shoe 로 먼저 등록하세요' },
        notes:          { type: 'string', description: '메모 (선택)' },
      },
      required: ['date', 'distance_km', 'duration'],
      additionalProperties: false,
    },
    annotations: { title: '러닝 기록 추가', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'update_run',
    title: '러닝 기록 수정',
    description:
      '이미 저장된 러닝 기록 1건을 고칩니다. 신발·훈련 종류·메모·external_id 를 나중에 채워 넣을 때 사용하세요. 고칠 기록은 id(list_runs 의 id) 또는 date 로 지정하고, 보낸 항목만 바뀌며 나머지는 그대로입니다. 같은 날짜에 기록이 여러 건이면 id 로 지정해야 합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        id:             { type: 'integer', description: '고칠 기록의 id. list_runs 결과에 있습니다' },
        date:           { ...DATE, description: '고칠 기록의 날짜 (YYYY-MM-DD, 한국 시간). id 를 모를 때만 사용하며, 그 날짜의 기록이 1건일 때만 됩니다' },
        new_date:       { ...DATE, description: '달린 날짜를 바꿀 때의 새 날짜 (선택)' },
        distance_km:    { type: 'number', exclusiveMinimum: 0, description: '거리 (km, 선택)' },
        duration:       { ...DURATION, description: '운동 시간(정지 시간을 뺀 이동 시간, 선택). "분:초" 또는 "시:분:초". 예: "52:30", "1:45:10"' },
        elapsed:        { type: 'string', pattern: '^(\\d{1,2}(:\\d{2}){1,2})?$', description: '총 경과 시간(정지 시간 포함, 선택). duration 과 같은 형식이며 duration 보다 짧을 수 없습니다. 빈 문자열이면 지웁니다' },
        external_id:    { type: 'string', maxLength: 100, description: '워치·앱이 붙인 활동 고유 ID (선택). TCX 는 Activity 의 Id 값. 예: "2026-10-03T00:03:06Z". 빈 문자열이면 지웁니다' },
        avg_heart_rate: { type: 'integer', minimum: 0, description: '평균 심박 (bpm, 선택). 0이면 지웁니다' },
        max_heart_rate: { type: 'integer', minimum: 0, description: '최고 심박 (bpm, 선택). 0이면 지웁니다' },
        run_type:       { type: 'string', enum: [...RUN_TYPES, ''], description: 'easy=이지런, long=롱런, tempo=지속주, interval=인터벌, race=대회 (선택). 빈 문자열이면 지웁니다' },
        shoe:           { type: 'string', description: '신은 신발 이름(선택). get_overview 의 shoes 에 있는 이름과 같아야 합니다. 빈 문자열이면 신발 표시를 지웁니다' },
        notes:          { type: 'string', description: '메모 (선택). 기존 메모를 통째로 바꿉니다' },
      },
      additionalProperties: false,
    },
    annotations: { title: '러닝 기록 수정', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'import_runs',
    title: '러닝 기록 대량 가져오기',
    description:
      '워치·앱에서 내보낸 러닝 기록 여러 건을 한 번에 저장합니다 (최대 200건). 이미 있는 기록은 새로 만들지 않습니다. external_id 가 같으면 같은 기록이고, external_id 로 못 찾으면 같은 날짜에 거리 차이가 100m 이내인 기록을 같은 기록으로 봅니다. 같은 기록이 있으면 비어 있는 항목(external_id, elapsed, 심박, 훈련 종류, 신발, 메모)만 채우고, 채울 것이 없으면 건너뜁니다. 결과로 추가·갱신·건너뜀 건수와 건너뛴 이유를 돌려줍니다.',
    inputSchema: {
      type: 'object',
      properties: {
        runs:      { type: 'array', items: IMPORT_ITEM, minItems: 1, maxItems: IMPORT_MAX },
        overwrite: { type: 'boolean', description: 'true 면 같은 기록의 날짜·거리·시간과 함께 보낸 항목을 새 값으로 바꿉니다. 기본값 false(빈 항목만 채움). 이미 저장된 시간·거리를 원본 기준으로 바로잡을 때만 사용하세요' },
      },
      required: ['runs'],
      additionalProperties: false,
    },
    annotations: { title: '러닝 기록 대량 가져오기', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'merge_runs',
    title: '중복 기록 합치기',
    description:
      '같은 달리기가 두 건으로 저장된 중복 기록을 하나로 합칩니다. keep_id 기록을 남기고 remove_id 기록을 삭제하며, 남는 기록에 비어 있는 항목(external_id, elapsed, 심박, 훈련 종류, 신발, 메모, GPS 경로)은 지우는 기록의 값으로 채웁니다. 날짜·거리·시간은 남는 기록의 값을 그대로 둡니다. 두 기록의 날짜가 같아야 합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        keep_id:   { type: 'integer', description: '남길 기록의 id. list_runs 결과에 있습니다' },
        remove_id: { type: 'integer', description: '지울 기록의 id' },
      },
      required: ['keep_id', 'remove_id'],
      additionalProperties: false,
    },
    annotations: { title: '중복 기록 합치기', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'delete_run',
    title: '러닝 기록 삭제',
    description:
      '러닝 기록 1건을 삭제합니다. 사용자가 지워 달라고 했을 때만 사용하세요. 중복 기록을 정리하는 것이라면 merge_runs 를 쓰면 한쪽에만 있는 심박·메모·경로를 잃지 않습니다.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: '지울 기록의 id. list_runs 결과에 있습니다' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { title: '러닝 기록 삭제', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
  {
    name: 'list_shoes',
    title: '신발 조회',
    description: '등록된 신발을 모두 돌려줍니다. 신발마다 브랜드·모델, 용도, 누적 거리(등록할 때 적은 거리 + RunMate 기록 합계), 달린 횟수, 은퇴 여부가 들어 있습니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: '신발 조회', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'add_shoe',
    title: '신발 등록',
    description:
      '신발을 RunMate에 등록합니다. 이름은 고유하며, 같은 이름의 신발이 이미 있으면 새로 만들지 않고 보낸 항목만 갱신합니다. 등록한 신발은 add_run · update_run 의 shoe 에 바로 쓸 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name:       { type: 'string', minLength: 1, maxLength: 40, description: '신발 이름. 기록에 신발을 붙일 때 이 이름을 씁니다. 예: "노바블라스트 5"' },
        brand:      { type: 'string', maxLength: 40, description: '브랜드 (선택). 예: "아식스"' },
        model:      { type: 'string', maxLength: 40, description: '모델명 (선택). 예: "Novablast 5"' },
        initial_km: { type: 'number', minimum: 0, description: '등록 시점까지 이미 신고 달린 거리 (km, 선택). 누적 거리에 더해집니다' },
        purpose:    { type: 'string', maxLength: 60, description: '용도 (선택). 예: "이지런·롱런", "대회·인터벌"' },
        retired:    { type: 'boolean', description: '은퇴 여부 (선택). true=더 이상 신지 않음' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { title: '신발 등록', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'retire_shoe',
    title: '신발 은퇴 처리',
    description: '신발을 은퇴 처리하거나, 다시 신는 상태로 되돌립니다. 은퇴한 신발의 누적 거리와 기록은 그대로 남습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: '신발 이름. list_shoes 에 있는 이름과 같아야 합니다' },
        retired: { type: 'boolean', description: 'true=은퇴(기본값), false=다시 신음' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { title: '신발 은퇴 처리', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_races',
    title: '참가 대회 조회',
    description: '사용자의 참가 대회(내 마라톤)를 날짜순으로 돌려줍니다. 지난 대회의 완주 기록과 다가오는 대회의 목표 기록이 함께 들어 있습니다. 기간을 생략하면 전체입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...DATE, description: '시작 날짜 (포함)' },
        to:   { ...DATE, description: '끝 날짜 (포함)' },
      },
      additionalProperties: false,
    },
    annotations: { title: '참가 대회 조회', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'add_race',
    title: '참가 대회 저장',
    description:
      '참가 대회를 내 마라톤에 저장합니다. 지난 대회는 result_time(완주 기록)을, 다가오는 대회는 goal_time(목표 기록)을 넣으세요. 같은 날짜에 같은 이름의 대회가 RunMate 대회 목록에 있으면 그 대회에 연결하고, 없으면 이 사용자에게만 보이는 대회로 새로 만듭니다. 이미 저장한 대회면 새로 만들지 않고 보낸 항목만 갱신합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string', minLength: 1, maxLength: 100, description: '대회 이름. 예: "2026 춘천마라톤"' },
        date:        { ...DATE, description: '대회 날짜 (YYYY-MM-DD, 한국 시간)' },
        event:       { type: 'string', maxLength: 20, description: '참가 종목. "Full", "Half", "10K", "5K" 중 하나로 적고, 그 밖의 종목은 "50K" 처럼 적습니다. 새 대회에는 event 나 distance_km 중 하나가 필요합니다' },
        distance_km: { type: 'number', exclusiveMinimum: 0, description: '종목 대신 거리(km)로 지정. 42.195=Full, 21.0975=Half, 10=10K, 5=5K' },
        goal_time:   { ...RACE_TIME, description: '목표 기록 "시:분:초" (선택). 예: "3:45:00", 10km 55분은 "0:55:00"' },
        result_time: { ...RACE_TIME, description: '완주 기록 "시:분:초" (선택). 예: "1:52:30"' },
        location:    { type: 'string', maxLength: 100, description: '대회 장소 (선택). 예: "강원 춘천시 공지천"' },
        notes:       { type: 'string', description: '레이스 메모 (선택)' },
      },
      required: ['name', 'date'],
      additionalProperties: false,
    },
    annotations: { title: '참가 대회 저장', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    elapsed:        r.elapsed != null ? formatDuration(r.elapsed) : null,
    external_id:    r.externalId ?? null,
  }
}

// 이름으로 신발 찾기 (앞뒤 공백·대소문자 무시). 매번 DB 에서 읽은 목록을 받으므로 방금 add_shoe 로 등록한 신발도 바로 찾음
function pickShoe<T extends { name: string }>(shoes: T[], name: unknown): T {
  const wanted = String(name).trim().toLowerCase()
  const shoe = shoes.find((s) => s.name.trim().toLowerCase() === wanted)
  if (!shoe) {
    throw new ToolError(
      shoes.length
        ? `"${name}" 신발이 없습니다. 등록된 신발: ${shoes.map((s) => s.name).join(', ')}. 새 신발이면 add_shoe 로 먼저 등록하세요`
        : '등록된 신발이 없습니다. add_shoe 로 먼저 등록하거나 shoe 없이 저장하세요',
    )
  }
  return shoe
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
      date:     raceDate(p.marathon.date),
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
  const shoeId = args.shoe ? pickShoe(shoes, args.shoe).id : null

  // TCX 임포트 · import_runs 와 같은 기준으로 중복 확인 (같은 날짜, 거리 ±100m). 시간은 몇 초씩 어긋나므로 보지 않음
  const dup = await findDuplicateRun(userId, { date, distance: dist })
  if (dup) {
    return {
      saved: false,
      duplicate: true,
      message:
        '같은 날짜에 거리가 같은(±100m) 기록이 이미 있습니다. 내용을 고치려면 update_run 을 쓰세요. 같은 날 같은 거리를 한 번 더 달린 것이라면 RunMate 웹의 기록 추가로 넣을 수 있습니다',
      run: runView(dup.run, names),
    }
  }

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

async function updateRun(userId: number, args: any) {
  const mine = { userId, deletedAt: null }
  let run
  if (args.id !== undefined) {
    run = await prisma.activity.findFirst({ where: { ...mine, id: Number(args.id) || 0 } })
    if (!run) throw new ToolError(`id=${args.id} 기록이 없습니다. list_runs 로 id 를 확인하세요`)
  } else if (args.date !== undefined) {
    if (!isDateStr(args.date)) throw new ToolError('date 는 YYYY-MM-DD 형식이어야 합니다')
    const found = await prisma.activity.findMany({ where: { ...mine, date: args.date }, orderBy: { id: 'asc' } })
    if (found.length === 0) throw new ToolError(`${args.date} 에는 기록이 없습니다`)
    if (found.length > 1) {
      throw new ToolError(
        `${args.date} 에 기록이 ${found.length}건 있습니다. id 로 지정하세요: ` +
          found.map((r) => `id=${r.id} (${round2(r.distance)}km, ${formatDuration(r.duration)})`).join(', '),
      )
    }
    run = found[0]
  } else {
    throw new ToolError('고칠 기록을 id 또는 date 로 지정하세요')
  }

  const shoes = await prisma.shoe.findMany({ where: { userId }, select: { id: true, name: true } })
  const names = new Map(shoes.map((s) => [s.id, s.name]))
  const data: Record<string, any> = {}

  if (args.new_date !== undefined) {
    if (!isDateStr(args.new_date)) throw new ToolError('new_date 는 YYYY-MM-DD 형식이어야 합니다')
    data.date = args.new_date
  }
  if (args.distance_km !== undefined) {
    const dist = Number(args.distance_km)
    if (!(dist > 0) || dist > 500) throw new ToolError('distance_km 는 0보다 큰 km 값이어야 합니다')
    data.distance = dist
  }
  if (args.duration !== undefined) {
    const durSec = parseDuration(String(args.duration))
    if (durSec <= 0) throw new ToolError('duration 은 "분:초" 또는 "시:분:초" 형식이어야 합니다 (예: "52:30")')
    data.duration = durSec
  }
  if (args.elapsed !== undefined) {
    const sec = String(args.elapsed).trim() ? parseDuration(String(args.elapsed)) : null
    if (sec !== null && sec <= 0) throw new ToolError('elapsed 는 "분:초" 또는 "시:분:초" 형식이어야 합니다 (예: "55:10")')
    data.elapsed = sec
  }
  if (args.external_id !== undefined) {
    const externalId = cleanExternalId(args.external_id) || null
    if (externalId) {
      const taken = await prisma.activity.findFirst({ where: { ...mine, externalId, id: { not: run.id } } })
      if (taken) {
        throw new ToolError(
          `external_id "${externalId}" 는 이미 id=${taken.id} 기록(${taken.date}, ${round2(taken.distance)}km)에 붙어 있습니다. 같은 달리기라면 merge_runs 로 합치세요`,
        )
      }
    }
    data.externalId = externalId
  }
  if (args.avg_heart_rate !== undefined) data.heartRate    = Math.max(0, Number(args.avg_heart_rate) || 0)
  if (args.max_heart_rate !== undefined) data.maxHeartRate = Math.max(0, Number(args.max_heart_rate) || 0)
  if (args.run_type !== undefined) {
    if (args.run_type !== '' && !RUN_TYPES.includes(args.run_type)) {
      throw new ToolError(`run_type 은 ${RUN_TYPES.join(', ')} 중 하나여야 합니다`)
    }
    data.runType = args.run_type
  }
  if (args.shoe !== undefined) data.shoeId = String(args.shoe).trim() ? pickShoe(shoes, args.shoe).id : null
  if (args.notes !== undefined) data.notes = String(args.notes).slice(0, 2000)

  if (Object.keys(data).length === 0) {
    throw new ToolError('바꿀 항목이 없습니다. shoe, run_type, notes 처럼 바꿀 값을 함께 보내세요')
  }
  const elapsed = data.elapsed !== undefined ? data.elapsed : run.elapsed
  if (elapsed != null && elapsed < (data.duration ?? run.duration)) {
    throw new ToolError(
      `elapsed(총 경과 시간 ${formatDuration(elapsed)})가 duration(이동 시간 ${formatDuration(data.duration ?? run.duration)})보다 짧습니다. 두 값을 함께 보내 바로잡으세요`,
    )
  }
  if (data.distance !== undefined || data.duration !== undefined) {
    const dist   = data.distance ?? run.distance
    const durSec = data.duration ?? run.duration
    data.pace        = calcPace(dist, durSec)
    data.paceSeconds = dist > 0 ? Math.round(durSec / dist) : 0
  }

  const updated = await prisma.activity.update({ where: { id: run.id }, data })
  // 월간 거리 배지는 날짜·거리가 바뀔 때만 다시 계산
  if (data.date !== undefined || data.distance !== undefined) await syncMonthlyKmBadges(userId).catch(() => {})

  return { updated: true, run: runView(updated, names) }
}

// import_runs 의 항목 하나를 검사해서 DB 값으로 바꿈. 보내지 않았거나 비어 있는 선택 항목은 undefined
function parseImportItem(it: any, shoes: { id: number; name: string }[]) {
  if (!it || typeof it !== 'object') throw new ToolError('항목이 객체가 아닙니다')
  const dist     = Number(it.distance_km)
  const duration = parseDuration(String(it.duration ?? ''))
  if (!isDateStr(it.date)) throw new ToolError('date 는 YYYY-MM-DD 형식이어야 합니다')
  if (!(dist > 0) || dist > 500) throw new ToolError('distance_km 는 0보다 큰 km 값이어야 합니다')
  if (duration <= 0) throw new ToolError('duration 은 "분:초" 또는 "시:분:초" 형식이어야 합니다 (예: "52:30")')

  let elapsed: number | undefined
  if (it.elapsed !== undefined && String(it.elapsed).trim()) {
    elapsed = parseDuration(String(it.elapsed))
    if (elapsed <= 0) throw new ToolError('elapsed 는 "분:초" 또는 "시:분:초" 형식이어야 합니다 (예: "55:10")')
    if (elapsed < duration) throw new ToolError('elapsed(총 경과 시간)가 duration(이동 시간)보다 짧습니다')
  }
  if (it.run_type !== undefined && it.run_type !== '' && !RUN_TYPES.includes(it.run_type)) {
    throw new ToolError(`run_type 은 ${RUN_TYPES.join(', ')} 중 하나여야 합니다`)
  }

  return {
    date:         it.date as string,
    distance:     dist,
    duration,
    elapsed,
    externalId:   cleanExternalId(it.external_id) || null,
    heartRate:    Number(it.avg_heart_rate) > 0 ? Math.round(Number(it.avg_heart_rate)) : undefined,
    maxHeartRate: Number(it.max_heart_rate) > 0 ? Math.round(Number(it.max_heart_rate)) : undefined,
    runType:      (it.run_type as string) || undefined,
    shoeId:       String(it.shoe ?? '').trim() ? pickShoe(shoes, it.shoe).id : undefined,
    notes:        String(it.notes ?? '').slice(0, 2000) || undefined,
  }
}

async function importRuns(userId: number, args: any) {
  const items = args.runs
  if (!Array.isArray(items) || items.length === 0) throw new ToolError('runs 배열이 필요합니다')
  if (items.length > IMPORT_MAX) throw new ToolError(`한 번에 ${IMPORT_MAX}건까지 가져올 수 있습니다. 나눠서 보내세요`)
  if (args.overwrite !== undefined && typeof args.overwrite !== 'boolean') {
    throw new ToolError('overwrite 는 true 또는 false 여야 합니다')
  }
  const overwrite = args.overwrite === true

  // 항목마다 DB 를 조회하지 않도록 내 기록을 한 번에 읽어 메모리에서 대조 (GPS 경로는 커서 제외)
  const [rows, shoes] = await Promise.all([
    prisma.activity.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true, date: true, distance: true, duration: true, elapsed: true, externalId: true,
        heartRate: true, maxHeartRate: true, runType: true, shoeId: true, notes: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.shoe.findMany({ where: { userId }, select: { id: true, name: true } }),
  ])

  // 같은 요청 안에서 먼저 나온 항목도 대조 대상. 아직 저장 전이라 id 가 null 이고 몇 번째 항목인지(index)만 앎
  type Row = Omit<(typeof rows)[number], 'id'> & { id: number | null; index?: number }
  const pool: Row[] = [...rows]
  const creates: Prisma.ActivityCreateManyInput[] = []
  const updates = new Map<number, Record<string, any>>()
  const updatedRuns: unknown[] = []
  const skippedRuns: unknown[] = []
  const failedRuns:  unknown[] = []

  items.forEach((raw: any, index: number) => {
    let it: ReturnType<typeof parseImportItem>
    try {
      it = parseImportItem(raw, shoes)
    } catch (e) {
      if (!(e instanceof ToolError)) throw e
      failedRuns.push({ index, date: typeof raw?.date === 'string' ? raw.date : null, reason: e.message })
      return
    }

    const match = matchRun(pool, it)
    if (!match) {
      creates.push({
        userId,
        date:         it.date,
        distance:     it.distance,
        duration:     it.duration,
        elapsed:      it.elapsed ?? null,
        externalId:   it.externalId,
        pace:         calcPace(it.distance, it.duration),
        paceSeconds:  Math.round(it.duration / it.distance),
        heartRate:    it.heartRate ?? 0,
        maxHeartRate: it.maxHeartRate ?? 0,
        runType:      it.runType ?? '',
        notes:        it.notes ?? '',
        shoeId:       it.shoeId ?? null,
      })
      pool.push({
        id: null, index, date: it.date, distance: it.distance, duration: it.duration, elapsed: it.elapsed ?? null,
        externalId: it.externalId, heartRate: it.heartRate ?? 0, maxHeartRate: it.maxHeartRate ?? 0,
        runType: it.runType ?? '', shoeId: it.shoeId ?? null, notes: it.notes ?? '',
      })
      return
    }

    const cur  = match.run
    const same = match.by === 'external_id' ? 'external_id 가 같은 기록' : '같은 날짜에 거리가 100m 이내인 기록'
    if (cur.id === null) {
      skippedRuns.push({ index, external_id: it.externalId, date: it.date, reason: `같은 요청의 runs[${cur.index}] 와 ${same}입니다`, existing_id: null })
      return
    }

    // 기본은 빈 항목만 채우고, overwrite 면 보낸 값으로 바꿈
    const data: Record<string, any> = {}
    const changed: string[] = []
    const set = (field: string, key: keyof Row, value: any) => {
      data[key] = value
      ;(cur as any)[key] = value // 뒤에 오는 항목이 바뀐 값으로 대조되도록
      changed.push(field)
    }
    const want = (blank: boolean, differs: boolean) => (overwrite ? differs : blank)

    if (overwrite) {
      if (cur.date !== it.date) set('date', 'date', it.date)
      if (round2(cur.distance) !== round2(it.distance)) set('distance_km', 'distance', it.distance)
      if (cur.duration !== it.duration) set('duration', 'duration', it.duration)
    }
    if (it.externalId && !cur.externalId) set('external_id', 'externalId', it.externalId)
    if (it.elapsed !== undefined && it.elapsed >= cur.duration && want(cur.elapsed == null, cur.elapsed !== it.elapsed)) {
      set('elapsed', 'elapsed', it.elapsed)
    } else if (cur.elapsed != null && cur.elapsed < cur.duration) {
      set('elapsed', 'elapsed', null) // 시간을 바꿔서 총 경과 시간이 더 짧아졌으면 알 수 없는 값으로 둠
    }
    if (it.heartRate !== undefined && want(!cur.heartRate, cur.heartRate !== it.heartRate)) set('avg_heart_rate', 'heartRate', it.heartRate)
    if (it.maxHeartRate !== undefined && want(!cur.maxHeartRate, cur.maxHeartRate !== it.maxHeartRate)) set('max_heart_rate', 'maxHeartRate', it.maxHeartRate)
    if (it.runType !== undefined && want(!cur.runType, cur.runType !== it.runType)) set('run_type', 'runType', it.runType)
    if (it.shoeId !== undefined && want(cur.shoeId == null, cur.shoeId !== it.shoeId)) set('shoe', 'shoeId', it.shoeId)
    if (it.notes !== undefined && want(!cur.notes, cur.notes !== it.notes)) set('notes', 'notes', it.notes)

    if (changed.length === 0) {
      skippedRuns.push({
        index,
        external_id: it.externalId,
        date:        it.date,
        reason:      `${same}이 이미 있고 채울 빈 항목이 없습니다 (${round2(cur.distance)}km, ${formatDuration(cur.duration)})`,
        existing_id: cur.id,
      })
      return
    }
    if (data.distance !== undefined || data.duration !== undefined) {
      data.pace        = calcPace(cur.distance, cur.duration)
      data.paceSeconds = Math.round(cur.duration / cur.distance)
    }
    updates.set(cur.id, { ...updates.get(cur.id), ...data })
    updatedRuns.push({ index, id: cur.id, date: cur.date, matched_by: match.by, changed })
  })

  // 새 기록은 한 번에 넣고, 갱신과 함께 한 트랜잭션으로 처리 (일부만 저장되는 일이 없도록)
  const ops: Prisma.PrismaPromise<unknown>[] = [
    ...(creates.length ? [prisma.activity.createMany({ data: creates })] : []),
    ...Array.from(updates, ([id, data]) => prisma.activity.update({ where: { id }, data })),
  ]
  if (ops.length) {
    try {
      await prisma.$transaction(ops)
    } catch (e: any) {
      // 대조한 뒤 저장하기 전에 다른 곳에서 같은 external_id 가 먼저 들어간 경우
      if (e?.code === 'P2002') throw new ToolError('같은 external_id 의 기록이 방금 다른 곳에서 저장되어 아무것도 저장하지 않았습니다. 다시 시도하세요')
      throw e
    }
    await syncMonthlyKmBadges(userId).catch(() => {})
  }

  return {
    total:        items.length,
    added:        creates.length,
    updated:      updatedRuns.length,
    skipped:      skippedRuns.length,
    failed:       failedRuns.length,
    updated_runs: updatedRuns,
    skipped_runs: skippedRuns,
    failed_runs:  failedRuns,
  }
}

async function mergeRuns(userId: number, args: any) {
  const keepId   = Number(args.keep_id)
  const removeId = Number(args.remove_id)
  if (!Number.isInteger(keepId) || !Number.isInteger(removeId)) throw new ToolError('keep_id 와 remove_id 가 필요합니다')
  if (keepId === removeId) throw new ToolError('keep_id 와 remove_id 가 같습니다')

  const [found, shoes] = await Promise.all([
    prisma.activity.findMany({ where: { userId, deletedAt: null, id: { in: [keepId, removeId] } } }),
    prisma.shoe.findMany({ where: { userId }, select: { id: true, name: true } }),
  ])
  const keep   = found.find((r) => r.id === keepId)
  const remove = found.find((r) => r.id === removeId)
  if (!keep)   throw new ToolError(`id=${keepId} 기록이 없습니다. list_runs 로 id 를 확인하세요`)
  if (!remove) throw new ToolError(`id=${removeId} 기록이 없습니다. list_runs 로 id 를 확인하세요`)
  if (keep.date !== remove.date) {
    throw new ToolError(
      `두 기록의 날짜가 다릅니다 (id=${keep.id}: ${keep.date}, id=${remove.id}: ${remove.date}). 같은 달리기가 맞다면 update_run 으로 날짜를 먼저 맞추고, 그냥 지우려는 것이라면 delete_run 을 쓰세요`,
    )
  }

  // 남는 기록에 비어 있는 항목만 지우는 기록의 값으로 채움
  const data: Record<string, any> = {}
  const filled: string[] = []
  const fill = (field: string, key: keyof typeof keep, blank: (v: any) => boolean) => {
    if (blank(keep[key]) && !blank(remove[key])) {
      data[key] = remove[key]
      filled.push(field)
    }
  }
  const empty = (v: any) => v == null || v === '' || v === 0
  fill('external_id',    'externalId',   empty)
  fill('elapsed',        'elapsed',      (v) => v == null || v < keep.duration)
  fill('avg_heart_rate', 'heartRate',    empty)
  fill('max_heart_rate', 'maxHeartRate', empty)
  fill('run_type',       'runType',      empty)
  fill('shoe',           'shoeId',       empty)
  fill('notes',          'notes',        empty)
  fill('calories',       'calories',     empty)
  fill('weather',        'weather',      empty)
  fill('route',          'routeData',    (v) => !v || v === '[]')
  fill('marathon',       'marathonId',   empty)

  // 지우는 쪽의 external_id 를 먼저 비워야 남는 쪽이 그 값을 받을 수 있음 (유니크 제약)
  const [, merged] = await prisma.$transaction([
    prisma.activity.update({ where: { id: remove.id }, data: deletedRun() }),
    prisma.activity.update({ where: { id: keep.id }, data }),
  ])
  await syncMonthlyKmBadges(userId).catch(() => {})

  return { merged: true, removed_id: remove.id, filled, run: runView(merged, new Map(shoes.map((s) => [s.id, s.name]))) }
}

async function deleteRun(userId: number, args: any) {
  const [run, shoes] = await Promise.all([
    prisma.activity.findFirst({ where: { userId, deletedAt: null, id: Number(args.id) || 0 } }),
    prisma.shoe.findMany({ where: { userId }, select: { id: true, name: true } }),
  ])
  if (!run) throw new ToolError(`id=${args.id} 기록이 없습니다. list_runs 로 id 를 확인하세요`)

  const view = runView(run, new Map(shoes.map((s) => [s.id, s.name]))) // 지우기 전 모습을 돌려줌
  await prisma.activity.update({ where: { id: run.id }, data: deletedRun() })
  await syncMonthlyKmBadges(userId).catch(() => {})

  return { deleted: true, run: view }
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

function shoeView(s: Awaited<ReturnType<typeof listShoes>>[number]) {
  return {
    name:       s.name,
    brand:      s.brand || null,
    model:      s.model || null,
    purpose:    s.purpose || null,
    initial_km: s.startKm,
    km:         s.km,
    runs:       s.runs,
    retired:    s.retired,
  }
}

async function listShoesTool(userId: number) {
  const shoes = await listShoes(userId)
  return { count: shoes.length, shoes: shoes.map(shoeView) }
}

async function addShoe(userId: number, args: any) {
  const name = shoeText(args.name)
  if (!name) throw new ToolError('name(신발 이름)이 필요합니다')
  if (args.initial_km !== undefined && !(Number(args.initial_km) >= 0)) {
    throw new ToolError('initial_km 는 0 이상의 km 값이어야 합니다')
  }
  if (args.retired !== undefined && typeof args.retired !== 'boolean') {
    throw new ToolError('retired 는 true 또는 false 여야 합니다')
  }

  const mine     = await prisma.shoe.findMany({ where: { userId }, orderBy: { id: 'asc' } })
  const existing = mine.find((s) => s.name.trim().toLowerCase() === name.toLowerCase())
  const fields = {
    ...(args.brand      !== undefined ? { brand:   shoeText(args.brand) }       : {}),
    ...(args.model      !== undefined ? { model:   shoeText(args.model) }       : {}),
    ...(args.purpose    !== undefined ? { purpose: shoeText(args.purpose, 60) } : {}),
    ...(args.initial_km !== undefined ? { startKm: Number(args.initial_km) }    : {}),
  }

  if (existing) {
    await prisma.shoe.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(args.retired !== undefined ? { retiredAt: args.retired ? (existing.retiredAt ?? new Date()) : null } : {}),
      },
    })
  } else {
    await prisma.shoe.create({ data: { userId, name, ...fields, retiredAt: args.retired ? new Date() : null } })
  }

  const saved = (await listShoes(userId)).find((s) => s.name.trim().toLowerCase() === name.toLowerCase())!
  return { created: !existing, shoe: shoeView(saved) }
}

async function retireShoe(userId: number, args: any) {
  if (!String(args.name ?? '').trim()) throw new ToolError('name(신발 이름)이 필요합니다')
  const retired = args.retired ?? true
  if (typeof retired !== 'boolean') throw new ToolError('retired 는 true 또는 false 여야 합니다')

  const shoe = pickShoe(await prisma.shoe.findMany({ where: { userId }, orderBy: { id: 'asc' } }), args.name)
  await prisma.shoe.update({
    where: { id: shoe.id },
    data:  { retiredAt: retired ? (shoe.retiredAt ?? new Date()) : null },
  })

  const saved = (await listShoes(userId)).find((s) => s.id === shoe.id)!
  return { shoe: shoeView(saved) }
}

// 대회 날짜는 문자열 컬럼이라 "2026.03.15" 같은 예전 표기도 YYYY-MM-DD 로 맞춰서 비교
const raceDate = (date: string) => date.replace(/\./g, '-').slice(0, 10)

function raceView(p: any, today: string) {
  const date = raceDate(p.marathon.date)
  return {
    id:          p.id,
    name:        p.marathon.name,
    date,
    event:       p.category || null,
    location:    p.marathon.location || null,
    goal_time:   p.goalTime   != null ? formatRaceTime(p.goalTime)   : null,
    result_time: p.finishTime != null ? formatRaceTime(p.finishTime) : null,
    notes:       p.raceNotes || null,
    days_left:   isDateStr(date) && date >= today ? Math.round((Date.parse(date) - Date.parse(today)) / 86400000) : null,
    custom:      p.marathon.createdBy != null, // true=사용자가 직접 추가한 대회
  }
}

async function listRaces(userId: number, args: any) {
  for (const k of ['from', 'to']) {
    if (args[k] !== undefined && !isDateStr(args[k])) throw new ToolError('from, to 는 YYYY-MM-DD 형식이어야 합니다')
  }
  if (args.from && args.to && args.from > args.to) throw new ToolError('from 이 to 보다 늦습니다')

  const today = kstToday()
  const parts = await prisma.marathonParticipation.findMany({
    where: { userId, deletedAt: null },
    include: { marathon: true },
  })
  const races = parts
    .map((p) => raceView(p, today))
    .filter((r) => (!args.from || r.date >= args.from) && (!args.to || r.date <= args.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  return { from: args.from ?? null, to: args.to ?? null, count: races.length, races }
}

async function addRace(userId: number, args: any) {
  const times: Record<string, number | undefined> = {}
  for (const k of ['goal_time', 'result_time']) {
    if (args[k] === undefined) continue
    const sec = parseRaceTime(args[k])
    if (sec === null || sec <= 0) throw new ToolError(`${k} 은 "시:분:초" 형식이어야 합니다 (예: "3:45:00", 10km 55분은 "0:55:00")`)
    times[k] = sec
  }
  if (args.distance_km !== undefined && !(Number(args.distance_km) > 0)) {
    throw new ToolError('distance_km 는 0보다 큰 km 값이어야 합니다')
  }
  const event = eventOf(args.event, args.distance_km)

  try {
    const f = raceFields({ name: args.name ?? '', date: args.date ?? '', location: args.location })

    let marathon = await findRace(userId, f.name!, f.date!, true)
    let part = marathon
      ? await prisma.marathonParticipation.findFirst({ where: { userId, marathonId: marathon.id } })
      : null
    if (!part && !event) throw new ToolError('새 대회에는 event(종목) 또는 distance_km 가 필요합니다')

    if (!marathon) {
      marathon = await createCustomRace(userId, { name: f.name, date: f.date, location: f.location ?? '', categories: event })
    } else if (marathon.createdBy === userId && (f.location !== undefined || event)) {
      // 직접 추가한 대회는 장소·종목도 함께 고침. 크롤링한 대회의 정보는 건드리지 않음
      marathon = await prisma.marathon.update({
        where: { id: marathon.id },
        data: {
          ...(f.location !== undefined ? { location: f.location, city: f.city } : {}),
          ...(event ? { categories: event } : {}),
        },
      })
    }

    const data = {
      ...(event ? { category: event } : {}),
      ...(times.goal_time   !== undefined ? { goalTime:   times.goal_time }   : {}),
      ...(times.result_time !== undefined ? { finishTime: times.result_time } : {}),
      ...(args.notes !== undefined ? { raceNotes: String(args.notes).slice(0, 2000) } : {}),
    }
    const saved = part
      ? await prisma.marathonParticipation.update({ where: { id: part.id }, data: { ...data, deletedAt: null } })
      : await prisma.marathonParticipation.create({ data: { userId, marathonId: marathon.id, ...data } })

    return { created: !part, race: raceView({ ...saved, marathon }, kstToday()) }
  } catch (e) {
    if (e instanceof RaceInputError) throw new ToolError(e.message)
    throw e
  }
}

const HANDLERS: Record<string, (userId: number, args: any) => Promise<unknown>> = {
  get_overview:  getOverview,
  list_runs:     listRuns,
  add_run:       addRun,
  update_run:    updateRun,
  import_runs:   importRuns,
  merge_runs:    mergeRuns,
  delete_run:    deleteRun,
  list_plans:    listPlans,
  save_plans:    savePlans,
  set_plan_done: setPlanDone,
  delete_plan:   deletePlan,
  list_shoes:    listShoesTool,
  add_shoe:      addShoe,
  retire_shoe:   retireShoe,
  list_races:    listRaces,
  add_race:      addRace,
}

export function hasTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name)
}

export async function callTool(userId: number, name: string, args: unknown): Promise<unknown> {
  return HANDLERS[name](userId, args && typeof args === 'object' ? args : {})
}
