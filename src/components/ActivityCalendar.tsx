'use client'

import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { Activity, Participation, Shoe, TrainingPlan } from '@/src/types'
import { calcPace, formatDuration, planKinds, runTypeLabels, toDateStr } from '@/src/lib/utils'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 마라톤 날짜는 "YYYY.MM.DD" 로 들어올 수 있어 "YYYY-MM-DD" 로 맞춤
function raceDate(p: Participation): string {
  return (p.marathon?.date ?? '').replace(/\./g, '-').slice(0, 10)
}

function dday(date: string, today: string): string {
  const diff = Math.round(
    (new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000,
  )
  if (diff === 0) return 'D-DAY'
  return diff > 0 ? `D-${diff}` : `D+${-diff}`
}

// 캘린더 칸에 넣는 하루 합계: 10km 이상은 소수 1자리, 미만은 2자리
function cellKm(km: number): string {
  return km >= 10 ? km.toFixed(1) : km.toFixed(2)
}

function heartRateText(r: Activity): string {
  if (r.heartRate && r.maxHeartRate) return `심박 ${r.heartRate} / 최고 ${r.maxHeartRate}`
  if (r.heartRate) return `심박 ${r.heartRate}`
  if (r.maxHeartRate) return `최고 심박 ${r.maxHeartRate}`
  return ''
}

export default function ActivityCalendar({
  year,
  month,
  records,
  races,
  plans,
  shoes,
  selected,
  onSelect,
  onOpenRecord,
  onAdd,
  aside,
  below,
}: {
  year: number
  month: number // 1–12
  records: Activity[]
  races: Participation[]
  plans: TrainingPlan[]
  shoes: Shoe[]
  selected: string // YYYY-MM-DD
  onSelect: (date: string) => void
  onOpenRecord: (r: Activity) => void
  onAdd: (date: string) => void
  aside?: ReactNode // 선택한 날 패널 아래 (주간 훈련 계획)
  below?: ReactNode // 캘린더 아래 (신발)
}) {
  const today = toDateStr(new Date())

  const runsByDate = useMemo(() => {
    const map: Record<string, Activity[]> = {}
    records.forEach((r) => (map[r.date] ??= []).push(r))
    return map
  }, [records])

  const racesByDate = useMemo(() => {
    const map: Record<string, Participation[]> = {}
    races.forEach((p) => {
      const d = raceDate(p)
      if (d) (map[d] ??= []).push(p)
    })
    return map
  }, [races])

  const planByDate = useMemo(() => {
    const map: Record<string, TrainingPlan> = {}
    plans.forEach((p) => (map[p.date] = p))
    return map
  }, [plans])

  const shoeName = useMemo(() => {
    const map: Record<number, string> = {}
    shoes.forEach((s) => (map[s.id] = s.name))
    return map
  }, [shoes])

  // 월요일 시작: 1일 앞에 비워둘 칸 수
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const days = new Date(year, month, 0).getDate()
  const ym = `${year}-${String(month).padStart(2, '0')}`

  const selRuns = runsByDate[selected] ?? []
  const selRaces = racesByDate[selected] ?? []
  const selPlan = planByDate[selected]
  const selPlanKind = selPlan ? planKinds[selPlan.kind] ?? planKinds.run : null
  const selD = new Date(selected + 'T00:00:00')
  const selSum = selRuns.reduce((s, r) => s + r.distance, 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 lg:grid-rows-[auto_1fr] gap-4 items-start">
      {/* 월간 캘린더 */}
      <section
        aria-label="월간 캘린더"
        className="lg:col-span-3 min-w-0 bg-white border border-[var(--border)] rounded-2xl p-3 sm:p-[18px]"
      >
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
          {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
            <span key={d} className="text-center text-[11px] font-semibold text-[var(--text2)]">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const d = i + 1
            const date = `${ym}-${String(d).padStart(2, '0')}`
            const runs = runsByDate[date] ?? []
            const km = runs.reduce((s, r) => s + r.distance, 0)
            const hasRun = runs.length > 0
            const isRace = !!racesByDate[date]
            const plan = planByDate[date]
            const planKind = plan ? planKinds[plan.kind] ?? planKinds.run : null
            const isToday = date === today
            const isSel = date === selected
            const sub = runs.length > 1 ? `${runs.length}회` : runTypeLabels[runs[0]?.runType ?? ''] ?? ''

            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                aria-pressed={isSel}
                aria-label={`${month}월 ${d}일${hasRun ? `, ${km.toFixed(2)}km` : ''}${isRace ? ', 대회' : ''}${
                  planKind ? `, 계획 ${planKind.label}${plan.done ? ' 완료' : ''}` : ''
                }`}
                className={`relative h-[52px] sm:h-[76px] min-w-0 p-0 text-left overflow-hidden rounded-[9px] sm:rounded-[10px] border cursor-pointer ${
                  hasRun ? 'bg-[rgba(0,200,150,0.10)]' : isRace ? 'bg-[rgba(234,88,12,0.08)]' : 'bg-[#fafbfc]'
                } ${
                  isRace
                    ? 'border-[rgba(234,88,12,0.4)]'
                    : hasRun
                      ? 'border-[rgba(0,200,150,0.38)]'
                      : 'border-[var(--border)]'
                }`}
                style={isSel ? { boxShadow: 'inset 0 0 0 2px var(--navy)' } : undefined}
              >
                <span
                  className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 min-w-[19px] h-[19px] sm:min-w-[22px] sm:h-[22px] px-1 flex items-center justify-center rounded-full text-[11px] sm:text-xs font-bold ${
                    isToday ? 'bg-[var(--navy)] text-white' : 'text-[var(--text2)]'
                  }`}
                >
                  {d}
                </span>
                {hasRun ? (
                  <span className="absolute left-[5px] right-0.5 bottom-1 sm:left-2 sm:right-1 sm:bottom-[7px] flex flex-col leading-tight">
                    <span className="text-[12.5px] sm:text-[15px] font-extrabold tracking-tight text-[var(--navy)]">
                      {cellKm(km)}
                    </span>
                    {isRace ? (
                      <span className="hidden sm:flex items-center gap-1 text-[10.5px] font-bold text-[#c2410c] whitespace-nowrap">
                        <i className="fas fa-flag text-[9px]" /> 대회
                      </span>
                    ) : (
                      sub && (
                        <span className="hidden sm:block text-[10.5px] text-[var(--text2)] whitespace-nowrap">
                          {sub}
                        </span>
                      )
                    )}
                  </span>
                ) : isRace ? (
                  <span className="absolute left-[5px] bottom-[5px] sm:left-2 sm:bottom-2 flex items-center gap-1 text-[11.5px] font-bold text-[#c2410c]">
                    <i className="fas fa-flag text-[11px]" />
                    <span className="hidden sm:inline">대회</span>
                  </span>
                ) : (
                  planKind && (
                    <span
                      className={`absolute left-[7px] bottom-[7px] sm:left-2 sm:bottom-2 flex items-center gap-[5px] text-[10.5px] text-[var(--text2)] whitespace-nowrap ${
                        plan.done ? 'opacity-50' : ''
                      }`}
                    >
                      <span
                        className="w-[7px] h-[7px] rounded-full border-[1.5px]"
                        style={{ background: planKind.pipBg, borderColor: planKind.pipBd }}
                      />
                      <span className="hidden sm:inline">{planKind.label}</span>
                    </span>
                  )
                )}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3.5 text-[11.5px] text-[var(--text2)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[rgba(0,200,150,0.14)] border border-[rgba(0,200,150,0.45)]" />
            달린 날 (숫자 = 하루 합계 km)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[rgba(234,88,12,0.1)] border border-[rgba(234,88,12,0.45)]" />
            참가 대회
          </span>
          {(['run', 'strength', 'rest'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className="w-[7px] h-[7px] rounded-full border-[1.5px]"
                style={{ background: planKinds[k].pipBg, borderColor: planKinds[k].pipBd }}
              />
              {k === 'rest' ? '휴식' : `${planKinds[k].label} 예정`}
            </span>
          ))}
        </div>
      </section>

      <div className="lg:col-span-2 lg:row-span-2 min-w-0 flex flex-col gap-4">
        {/* 선택한 날 */}
        <section
          aria-label="선택한 날"
          className="w-full min-w-0 bg-white border border-[var(--border)] rounded-2xl p-3.5 sm:p-[18px] flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-[15px] font-extrabold text-[var(--navy)]">
                {selD.getMonth() + 1}월 {selD.getDate()}일 ({DOW[selD.getDay()]})
              </h2>
              {selected === today && (
                <span className="px-2 py-px rounded-full text-[11px] font-bold bg-[var(--navy)] text-white">
                  오늘
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onAdd(selected)}
              className="btn-mint px-2.5 py-1.5 text-xs gap-1.5 whitespace-nowrap"
            >
              <i className="fas fa-plus" /> 기록 추가
            </button>
          </div>

          {selPlan && selPlanKind && (
            <p className="flex items-center gap-2 text-[12.5px] text-[var(--text2)]">
              <span
                className="shrink-0 px-2 py-px rounded-full text-[11px] font-bold"
                style={{ background: selPlanKind.bg, color: selPlanKind.fg }}
              >
                {selPlanKind.label}
              </span>
              <span className={`min-w-0 break-words ${selPlan.done ? 'line-through opacity-60' : ''}`}>
                계획: {selPlan.title}
              </span>
            </p>
          )}

          {selRuns.length > 1 && (
            <p className="text-xs text-[var(--text2)]">
              하루 합계 <b className="text-[var(--navy)]">{selSum.toFixed(2)} km</b> · {selRuns.length}회
            </p>
          )}

          {selRuns.map((r) => {
            const hr = heartRateText(r)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenRecord(r)}
                className="flex items-center gap-3 w-full p-3 text-left cursor-pointer bg-[var(--surface2)] border border-[var(--border)] rounded-xl hover:border-[rgba(0,200,150,0.5)] transition-colors"
              >
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="flex items-baseline flex-wrap gap-2">
                    {runTypeLabels[r.runType] && (
                      <span className="px-2 py-px rounded-full text-[11px] font-bold bg-[rgba(0,200,150,0.14)] text-[#00694f]">
                        {runTypeLabels[r.runType]}
                      </span>
                    )}
                    <span className="text-lg font-black tracking-tight text-[var(--navy)]">
                      {r.distance.toFixed(2)}
                      <span className="ml-0.5 text-xs font-normal text-[var(--text2)]">km</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text2)]">
                    <span>
                      <b className="font-semibold text-[var(--navy)]">{calcPace(r.distance, r.duration)}</b> /km
                    </span>
                    <span>{formatDuration(r.duration)}</span>
                    {hr && <span>{hr}</span>}
                    {r.shoeId && shoeName[r.shoeId] && <span>{shoeName[r.shoeId]}</span>}
                  </span>
                </span>
                <i className="fas fa-chevron-right text-[10px] text-[var(--text3)]" />
              </button>
            )
          })}

          {selRaces.map((p) => (
            <Link
              key={p.id}
              href="/participations"
              className="flex items-center gap-2.5 p-3 bg-[rgba(234,88,12,0.07)] border border-[rgba(234,88,12,0.35)] rounded-xl"
            >
              <i className="fas fa-flag text-[#c2410c]" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--navy)] truncate">{p.marathon.name}</p>
                <p className="text-[11.5px] text-[var(--text2)]">
                  {[p.category, p.finishTime ? `완주 ${p.finishTime}` : dday(selected, today)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </Link>
          ))}

          {selRuns.length === 0 && selRaces.length === 0 && (
            <p className="pt-3.5 pb-1.5 text-center text-[13px] text-[var(--text2)]">
              {selected > today ? '아직 기록이 없는 날입니다.' : '이 날은 기록이 없습니다.'}
            </p>
          )}
        </section>
        {aside}
      </div>

      {below && <div className="lg:col-span-3 min-w-0">{below}</div>}
    </div>
  )
}
