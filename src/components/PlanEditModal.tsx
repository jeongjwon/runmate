'use client'

import { useState } from 'react'
import { api } from '@/src/lib/api'
import { TrainingPlan } from '@/src/types'
import { addDays, planKinds } from '@/src/lib/utils'
import { useUI } from '@/src/context/UIContext'

const DOW = ['월', '화', '수', '목', '금', '토', '일']

interface Row {
  date: string
  kind: string // '' = 계획 없음
  title: string
  detail: string
}

// 한 주(월–일) 계획을 한 번에 편집. 종류를 '없음'으로 두면 그 날 계획은 삭제
export default function PlanEditModal({
  weekStart,
  plans,
  onClose,
  onSaved,
}: {
  weekStart: string
  plans: TrainingPlan[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showSnackbar } = useUI()
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<Row[]>(() =>
    DOW.map((_, i) => {
      const date = addDays(weekStart, i)
      const p = plans.find((x) => x.date === date)
      return { date, kind: p?.kind ?? '', title: p?.title ?? '', detail: p?.detail ?? '' }
    }),
  )
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const save = async () => {
    setSaving(true)
    try {
      for (const r of rows) {
        const before = plans.find((p) => p.date === r.date)
        if (!r.kind) {
          if (before) await api.delete(`/plans/${r.date}`)
        } else if (
          !before ||
          before.kind !== r.kind ||
          before.title !== r.title.trim() ||
          before.detail !== r.detail.trim()
        ) {
          await api.put(`/plans/${r.date}`, { kind: r.kind, title: r.title, detail: r.detail })
        }
      }
      onSaved()
      onClose()
      showSnackbar('계획이 저장되었습니다')
    } catch (e: any) {
      // 일부만 저장됐을 수 있으므로 목록은 새로 불러옴
      onSaved()
      showSnackbar(e.message || '계획 저장 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="px-5 py-4 flex justify-between items-center sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] rounded-t-2xl">
          <div>
            <h2 className="text-base font-extrabold text-[var(--navy)]">주간 계획 편집</h2>
            <p className="text-xs text-[var(--text2)] mt-0.5">
              {Number(weekStart.slice(5, 7))}월 {Number(weekStart.slice(8, 10))}일 주 · 종류를 ‘없음’으로 두면 그 날 계획은 지워집니다
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--surface2)] text-[var(--text2)]"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.date} className="flex gap-3 p-3 bg-[var(--surface2)] border border-[var(--border)] rounded-xl">
              <span className="w-[26px] pt-1 flex flex-col items-center leading-[1.15]">
                <span className="text-[10.5px] text-[var(--text2)]">{DOW[i]}</span>
                <span className="text-[15px] font-extrabold text-[var(--navy)]">{Number(r.date.slice(8, 10))}</span>
              </span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex gap-1.5">
                  <select
                    value={r.kind}
                    onChange={(e) => set(i, { kind: e.target.value })}
                    aria-label={`${DOW[i]}요일 종류`}
                    className="input-dark w-[104px] shrink-0"
                  >
                    <option value="">없음</option>
                    {Object.entries(planKinds).map(([key, k]) => (
                      <option key={key} value={key}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={r.title}
                    onChange={(e) => set(i, { title: e.target.value })}
                    disabled={!r.kind}
                    maxLength={100}
                    placeholder={r.kind === 'rest' ? '휴식' : '예: 이지런 6km'}
                    aria-label={`${DOW[i]}요일 제목`}
                    className="input-dark flex-1 min-w-0 disabled:opacity-50"
                  />
                </div>
                {r.kind && (
                  <input
                    value={r.detail}
                    onChange={(e) => set(i, { detail: e.target.value })}
                    maxLength={500}
                    placeholder="세부 내용 (선택)"
                    aria-label={`${DOW[i]}요일 세부 내용`}
                    className="input-dark w-full"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1 py-2.5 text-sm font-bold">
            취소
          </button>
          <button onClick={save} disabled={saving} className="btn-mint flex-1 justify-center py-2.5 text-sm">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
