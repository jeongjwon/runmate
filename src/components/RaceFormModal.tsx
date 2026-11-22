'use client'

import { useState } from 'react'
import { api } from '@/src/lib/api'
import { Marathon } from '@/src/types'
import { useUI } from '@/src/context/UIContext'

const EVENTS = ['5K', '10K', 'Half', 'Full']

// 목록에 없는 대회를 직접 추가·수정하는 모달. 추가한 대회는 본인에게만 보이고 바로 내 마라톤에 들어감
export default function RaceFormModal({
  marathon,
  initialName = '',
  onClose,
  onSaved,
}: {
  marathon?: Marathon
  initialName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { showSnackbar, showConfirm } = useUI()
  const [name, setName] = useState(marathon?.name ?? initialName)
  const [date, setDate] = useState(marathon?.date ?? '')
  const [location, setLocation] = useState(marathon?.location ?? '')
  const [event, setEvent] = useState(marathon?.categories ?? '')
  // 5K·10K·Half·Full 이 아닌 종목은 직접 입력
  const [customEvent, setCustomEvent] = useState(!!marathon?.categories && !EVENTS.includes(marathon.categories))
  const [url, setUrl] = useState(marathon?.officialUrl ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return showSnackbar('대회 이름을 입력해주세요', 'error')
    if (!date) return showSnackbar('대회 날짜를 선택해주세요', 'error')
    if (!event.trim()) return showSnackbar('참가 종목을 선택해주세요', 'error')
    setSaving(true)
    try {
      const body = { name, date, location, category: event.trim(), official_url: url.trim() }
      if (marathon) await api.put(`/marathons/${marathon.id}`, body)
      else await api.post('/marathons', body)
      onSaved()
      onClose()
      showSnackbar(marathon ? '대회가 수정되었습니다' : '대회를 내 마라톤에 추가했습니다')
    } catch (e: any) {
      showSnackbar(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = () => {
    if (!marathon) return
    showConfirm(
      '대회 삭제',
      `‘${marathon.name}’을(를) 삭제하시겠습니까? 내 마라톤에 저장한 완주 기록과 목표도 함께 지워집니다.`,
      async () => {
        try {
          await api.delete(`/marathons/${marathon.id}`)
          onSaved()
          onClose()
          showSnackbar('대회가 삭제되었습니다')
        } catch (e: any) {
          showSnackbar(e.message, 'error')
        }
      },
    )
  }

  const chip = (active: boolean) =>
    `px-3 py-1 text-xs font-bold rounded-full border transition-colors ${
      active ? 'bg-[var(--mint)] text-white border-[var(--mint)]' : 'border-[var(--border)] text-[var(--text2)]'
    }`

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="px-5 py-4 flex justify-between items-center border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-extrabold text-[var(--navy)]">{marathon ? '대회 수정' : '대회 직접 추가'}</h2>
            {!marathon && (
              <p className="mt-0.5 text-[11.5px] text-[var(--text3)]">나에게만 보이고, 내 마라톤에 바로 추가됩니다.</p>
            )}
          </div>
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
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">대회 이름 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="예: 2026 우리동네 마라톤"
              className="input-dark w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">대회 날짜 *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-dark w-full" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">참가 종목 *</label>
            <div className="flex flex-wrap gap-1.5">
              {EVENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setEvent(c)
                    setCustomEvent(false)
                  }}
                  className={chip(!customEvent && event === c)}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!customEvent) setEvent('')
                  setCustomEvent(true)
                }}
                className={chip(customEvent)}
              >
                기타
              </button>
            </div>
            {customEvent && (
              <input
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                maxLength={20}
                placeholder="예: 50K, 32K"
                className="input-dark w-full mt-2"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">장소</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={100}
              placeholder="예: 서울 여의도공원"
              className="input-dark w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">홈페이지</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={300}
              placeholder="https://"
              className="input-dark w-full"
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          {marathon && (
            <button
              onClick={remove}
              aria-label="대회 삭제"
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
