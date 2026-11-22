'use client'

import { TrainingPlan } from '@/src/types'
import { addDays, getMonday, planKinds, toDateStr } from '@/src/lib/utils'

const DOW = ['월', '화', '수', '목', '금', '토', '일']

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

// 선택한 날이 속한 주(월–일)의 훈련 계획. 체크박스로 완료 표시
export default function WeekPlanCard({
  weekStart,
  plans,
  onToggle,
  onEdit,
}: {
  weekStart: string // 월요일 YYYY-MM-DD
  plans: TrainingPlan[]
  onToggle: (plan: TrainingPlan, done: boolean) => void
  onEdit: () => void
}) {
  const today = toDateStr(new Date())
  const thisMonday = toDateStr(getMonday(new Date()))
  const heading =
    weekStart === thisMonday
      ? '이번 주 훈련'
      : weekStart === addDays(thisMonday, 7)
        ? '다음 주 훈련'
        : weekStart === addDays(thisMonday, -7)
          ? '지난주 훈련'
          : '주간 훈련'

  const days = DOW.map((dow, i) => {
    const date = addDays(weekStart, i)
    return { dow, date, plan: plans.find((p) => p.date === date) }
  })
  const hasAny = days.some((d) => d.plan)

  return (
    <section
      aria-label={heading}
      className="w-full bg-white border border-[var(--border)] rounded-2xl p-3.5 sm:p-[18px] flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-extrabold text-[var(--navy)]">{heading}</h2>
          <span className="text-xs text-[var(--text2)]">
            {md(weekStart)} – {md(addDays(weekStart, 6))}
          </span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="px-2.5 py-[5px] rounded-lg border border-[var(--border)] bg-white text-xs font-semibold text-[var(--text2)] whitespace-nowrap hover:bg-[var(--surface2)] transition-colors"
        >
          계획 편집
        </button>
      </div>

      {hasAny ? (
        <ul className="flex flex-col gap-[7px]">
          {days.map(({ dow, date, plan }) => {
            const kind = plan ? planKinds[plan.kind] ?? planKinds.run : null
            return (
              <li
                key={date}
                className={`flex items-center gap-3 px-3 py-2 bg-[var(--surface2)] rounded-[11px] border ${
                  date === today ? 'border-[var(--navy)]' : 'border-[var(--border)]'
                }`}
              >
                <span className="w-[26px] flex flex-col items-center leading-[1.15]">
                  <span className="text-[10.5px] text-[var(--text2)]">{dow}</span>
                  <span className="text-[15px] font-extrabold text-[var(--navy)]">{Number(date.slice(8, 10))}</span>
                </span>
                {plan && kind ? (
                  <>
                    <span className={`flex-1 min-w-0 flex flex-col ${plan.done ? 'opacity-55' : ''}`}>
                      <span className="flex items-center gap-1.5 text-[13.5px] font-bold text-[var(--navy)]">
                        <span
                          className="shrink-0 px-[7px] rounded-full text-[10.5px] font-bold"
                          style={{ background: kind.bg, color: kind.fg }}
                        >
                          {kind.label}
                        </span>
                        <span className={`min-w-0 break-words ${plan.done ? 'line-through' : ''}`}>{plan.title}</span>
                      </span>
                      {plan.detail && (
                        <span className="text-[11.5px] text-[var(--text2)] break-words">{plan.detail}</span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={plan.done}
                      onChange={(e) => onToggle(plan, e.target.checked)}
                      aria-label={`${md(date)} ${plan.title} 완료`}
                      className="w-[18px] h-[18px] shrink-0 cursor-pointer accent-[#00c896]"
                    />
                  </>
                ) : (
                  <span className="flex-1 text-xs text-[var(--text3)]">계획 없음</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="py-3 text-center">
          <p className="text-[13px] text-[var(--text2)]">이 주에는 아직 계획이 없습니다.</p>
          <p className="mt-1 text-[11.5px] text-[var(--text3)]">
            ‘계획 편집’으로 직접 넣거나, 프로필 메뉴의 ‘Claude 연동’으로 연결해 두면 Claude와 짠 계획이 여기에 들어옵니다.
          </p>
        </div>
      )}
    </section>
  )
}
