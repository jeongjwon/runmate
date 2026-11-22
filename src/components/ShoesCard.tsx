'use client'

import { useState } from 'react'
import { api } from '@/src/lib/api'
import { Shoe } from '@/src/types'
import { SHOE_LIMIT_KM } from '@/src/lib/utils'
import { useUI } from '@/src/context/UIContext'

// 신발 추가·수정 모달. 수정일 때는 은퇴 처리와 삭제도 가능
function ShoeModal({
  shoe,
  onClose,
  onSaved,
}: {
  shoe?: Shoe
  onClose: () => void
  onSaved: () => void
}) {
  const { showSnackbar, showConfirm } = useUI()
  const [name, setName] = useState(shoe?.name ?? '')
  const [startKm, setStartKm] = useState<string>(shoe?.startKm ? String(shoe.startKm) : '')
  const [retired, setRetired] = useState(shoe?.retired ?? false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return showSnackbar('신발 이름을 입력해주세요', 'error')
    setSaving(true)
    try {
      const body = { name, start_km: Number(startKm) || 0, retired }
      if (shoe) await api.put(`/shoes/${shoe.id}`, body)
      else await api.post('/shoes', body)
      onSaved()
      onClose()
      showSnackbar(shoe ? '신발이 수정되었습니다' : '신발이 추가되었습니다')
    } catch (e: any) {
      showSnackbar(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    if (!shoe) return
    showConfirm(
      '신발 삭제',
      `‘${shoe.name}’을(를) 삭제하시겠습니까? 이 신발로 저장한 기록은 남고, 기록의 신발 표시만 지워집니다.`,
      async () => {
        try {
          await api.delete(`/shoes/${shoe.id}`)
          onSaved()
          onClose()
          showSnackbar('신발이 삭제되었습니다')
        } catch (e: any) {
          showSnackbar(e.message, 'error')
        }
      },
    )
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl"
      >
        <div className="px-5 py-4 flex justify-between items-center border-b border-[var(--border)]">
          <h2 className="text-base font-extrabold text-[var(--navy)]">{shoe ? '신발 수정' : '신발 추가'}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface2)] text-[var(--text2)]"
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">이름 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="예: 데일리 트레이너"
              className="input-dark w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">이미 달린 거리 (km)</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={startKm}
              onChange={(e) => setStartKm(e.target.value)}
              placeholder="0"
              className="input-dark w-full"
            />
            <p className="mt-1.5 text-[11.5px] text-[var(--text3)]">
              RunMate에 등록하기 전에 이 신발로 달린 거리입니다. 누적 거리에 더해집니다.
            </p>
          </div>
          {shoe && (
            <label className="flex items-center gap-2 text-[13px] text-[var(--text)] cursor-pointer">
              <input
                type="checkbox"
                checked={retired}
                onChange={(e) => setRetired(e.target.checked)}
                className="w-4 h-4 accent-[#00c896]"
              />
              더 이상 신지 않음 (기록 입력 선택지에서 숨김)
            </label>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          {shoe && (
            <button
              onClick={remove}
              aria-label="신발 삭제"
              className="btn-outline px-3 py-2.5 text-sm text-red-500 hover:!bg-red-50"
            >
              <i className="fas fa-trash text-xs" />
            </button>
          )}
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

// 신발별 누적 거리. 교체 기준의 80%를 넘으면 '교체 임박' 표시
export default function ShoesCard({ shoes, onChanged }: { shoes: Shoe[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Shoe | null>(null)

  // 신는 신발 먼저, 은퇴한 신발은 아래로
  const sorted = [...shoes].sort((a, b) => Number(a.retired) - Number(b.retired))

  return (
    <section
      aria-label="신발"
      className="w-full bg-white border border-[var(--border)] rounded-2xl p-3.5 sm:p-[18px] flex flex-col gap-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-extrabold text-[var(--navy)]">신발</h2>
          <span className="text-xs text-[var(--text2)]">교체 기준 {SHOE_LIMIT_KM} km</span>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-[5px] px-[11px] py-1.5 rounded-lg border border-[var(--border)] bg-white text-xs font-bold text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
        >
          <i className="fas fa-plus text-[10px]" /> 신발 추가
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="py-2 text-center text-[13px] text-[var(--text2)]">아직 등록한 신발이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {sorted.map((s) => {
            const near = !s.retired && s.km / SHOE_LIMIT_KM >= 0.8
            const pct = Math.min(100, Math.round((s.km / SHOE_LIMIT_KM) * 100))
            return (
              <li key={s.id} className={`flex flex-col gap-1.5 ${s.retired ? 'opacity-55' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      title="신발 수정"
                      className="min-w-0 truncate text-[13.5px] font-bold text-[var(--navy)] hover:underline"
                    >
                      {s.name}
                    </button>
                    {near && (
                      <span className="shrink-0 px-[7px] rounded-full text-[10.5px] font-bold bg-[rgba(234,88,12,0.1)] text-[#c2410c]">
                        교체 임박
                      </span>
                    )}
                    {s.retired && (
                      <span className="shrink-0 px-[7px] rounded-full text-[10.5px] font-bold bg-[#eceff2] text-[var(--text2)]">
                        은퇴
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] font-extrabold text-[var(--navy)] whitespace-nowrap">
                    {s.km.toFixed(1)}
                    <span className="ml-0.5 text-[11.5px] font-normal text-[var(--text2)]">km · {s.runs}회</span>
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={`${s.name} 누적 ${s.km.toFixed(1)}km, 교체 기준 ${SHOE_LIMIT_KM}km`}
                  className="h-2 rounded-full bg-[#eceff2] overflow-hidden"
                >
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${pct}%`, background: near ? '#ea580c' : '#00c896' }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="pt-3 border-t border-[var(--border)] text-xs text-[var(--text2)]">
        기록을 저장할 때 고른 신발에 거리가 자동으로 더해집니다.
      </p>

      {(adding || editing) && (
        <ShoeModal
          shoe={editing ?? undefined}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSaved={onChanged}
        />
      )}
    </section>
  )
}
