'use client'

import { useState } from 'react'
import { api } from '@/src/lib/api'
import { Activity, Shoe } from '@/src/types'
import { useUI } from '@/src/context/UIContext'
import RunTypePicker from '@/src/components/RunTypePicker'

export interface TcxResult {
  name: string // 파일명
  status: 'added' | 'duplicate' | 'error'
  record?: Activity
  filled?: boolean // 중복이지만 기존 기록에 빠진 정보(경로·심박 등)를 채웠음
  error?: string
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// TCX 업로드 직후 결과를 보여주고, 새로 추가된 기록의 훈련 종류와 신발을 바로 고르게 하는 모달
export default function TcxImportModal({
  results,
  shoes,
  onClose,
  onSaved,
}: {
  results: TcxResult[]
  shoes: Shoe[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showSnackbar } = useUI()
  const [types, setTypes] = useState<Record<number, string>>({})
  const [shoeIds, setShoeIds] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  const added = results.filter((r) => r.status === 'added' && r.record)
  const skipped = results.filter((r) => r.status !== 'added')
  const dupCount = results.filter((r) => r.status === 'duplicate').length
  const errCount = results.filter((r) => r.status === 'error').length
  const activeShoes = shoes.filter((s) => !s.retired)
  // 훈련 종류나 신발 중 하나라도 고른 기록만 저장
  const chosen = added
    .map(({ record }) => record!.id)
    .filter((id) => types[id] || shoeIds[id])

  const save = async () => {
    setSaving(true)
    try {
      for (const id of chosen) {
        await api.put(`/records/${id}`, {
          ...(types[id] ? { run_type: types[id] } : {}),
          ...(shoeIds[id] ? { shoe_id: Number(shoeIds[id]) } : {}),
        })
      }
      onSaved()
      onClose()
      showSnackbar('저장되었습니다')
    } catch (e: any) {
      // 일부만 저장됐을 수 있으므로 목록은 새로 불러옴
      onSaved()
      showSnackbar(e.message || '저장 실패', 'error')
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
            <h2 className="text-base font-extrabold text-[var(--navy)]">TCX 가져오기 결과</h2>
            <p className="text-xs text-[var(--text2)] mt-0.5">
              {[
                `${added.length}개 추가`,
                dupCount ? `중복 ${dupCount}개 건너뜀` : '',
                errCount ? `실패 ${errCount}개` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface2)] text-[var(--text2)]"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-[var(--text2)]">
            훈련 종류를 골라두면 캘린더에 함께 표시됩니다
            {activeShoes.length > 0 ? ', 신발을 고르면 그 신발의 누적 거리에 더해집니다' : ''}. 지금 고르지 않아도 나중에 기록 수정에서 바꿀 수 있어요.
          </p>

          {added.map(({ name, record }) => {
            const r = record!
            const d = new Date(r.date + 'T00:00:00')
            return (
              <div
                key={r.id}
                className="p-3 space-y-2.5 bg-[var(--surface2)] border border-[var(--border)] rounded-xl"
              >
                <div>
                  <div className="flex items-baseline flex-wrap gap-x-2">
                    <span className="text-xs font-bold text-[var(--text2)]">
                      {d.getMonth() + 1}월 {d.getDate()}일 ({DOW[d.getDay()]})
                    </span>
                    <span className="text-lg font-black tracking-tight text-[var(--navy)]">
                      {r.distance.toFixed(2)}
                      <span className="ml-0.5 text-xs font-normal text-[var(--text2)]">km</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text2)]">
                    <span>
                      <b className="font-semibold text-[var(--navy)]">{r.pace}</b> /km
                    </span>
                    <span>{r.duration_formatted}</span>
                    {r.heartRate > 0 && <span>심박 {r.heartRate}</span>}
                    {r.maxHeartRate > 0 && <span>최고 심박 {r.maxHeartRate}</span>}
                  </div>
                  <p className="text-[11px] text-[var(--text3)] truncate mt-0.5">{name}</p>
                </div>
                <RunTypePicker
                  value={types[r.id] ?? ''}
                  onChange={(v) => setTypes((t) => ({ ...t, [r.id]: v }))}
                />
                {activeShoes.length > 0 && (
                  <select
                    value={shoeIds[r.id] ?? ''}
                    onChange={(e) => setShoeIds((m) => ({ ...m, [r.id]: e.target.value }))}
                    aria-label="신발"
                    className="input-dark w-full"
                  >
                    <option value="">신발 선택 안 함</option>
                    {activeShoes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}

          {skipped.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-bold text-[var(--text2)] mb-1.5">추가되지 않은 파일</p>
              <ul className="space-y-1">
                {skipped.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 truncate text-[var(--text)]">{s.name}</span>
                    <span
                      className={`shrink-0 ${s.status === 'error' ? 'text-red-500' : 'text-[var(--text3)]'}`}
                    >
                      {s.status === 'duplicate' ? (s.filled ? '이미 등록된 기록 · 빠진 정보 채움' : '이미 등록된 기록') : s.error}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1 py-2.5 text-sm font-bold">
            닫기
          </button>
          <button
            onClick={save}
            disabled={saving || chosen.length === 0}
            className="btn-mint flex-1 justify-center py-2.5 text-sm"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
