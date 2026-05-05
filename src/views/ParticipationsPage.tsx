'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/src/lib/api'
import { Participation } from '@/src/types'
import { useUI } from '@/src/context/UIContext'

interface ParticipationsResponse {
  data: Participation[]
}

const FINISH_TIME_REGEX = /^\d{1,2}:\d{2}:\d{2}$/

export default function ParticipationsPage() {
  const qc = useQueryClient()
  const { showSnackbar, showConfirm } = useUI()
  const [editTarget, setEditTarget] = useState<{ participationId: number; marathonId: number } | null>(null)
  const [form, setForm] = useState({ finishTime: '', raceNotes: '' })

  const { data, isLoading } = useQuery<ParticipationsResponse>({
    queryKey: ['participations'],
    queryFn: () => api.get('/participations'),
  })

  const participations = data?.data ?? []

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/participations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['participations'] })
      qc.invalidateQueries({ queryKey: ['marathons'] })
      showSnackbar('내 마라톤에서 제거되었습니다')
    },
    onError: (e: Error) => showSnackbar(e.message, 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ marathonId, body }: { marathonId: number; body: object }) =>
      api.put(`/participations/${marathonId}/record`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['participations'] })
      setEditTarget(null)
      showSnackbar('기록이 업데이트되었습니다')
    },
    onError: (e: Error) => showSnackbar(e.message, 'error'),
  })

  const openEdit = (p: Participation) => {
    setEditTarget({ participationId: p.id, marathonId: p.marathonId })
    setForm({ finishTime: p.finishTime ?? '', raceNotes: p.raceNotes ?? '' })
  }

  const submitEdit = () => {
    if (!editTarget) return
    if (form.finishTime && !FINISH_TIME_REGEX.test(form.finishTime)) {
      showSnackbar('완주시간 형식: H:MM:SS (예: 4:32:10)', 'error')
      return
    }
    updateMut.mutate({
      marathonId: editTarget.marathonId,
      body: { finish_time: form.finishTime, race_notes: form.raceNotes },
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-5 flex items-center gap-2 text-[var(--navy)]">
        <i className="fas fa-star text-[var(--mint)]" />내 마라톤
      </h1>

      {isLoading ? (
        <div className="text-center py-20 text-[var(--text3)]">
          <i className="fas fa-spinner fa-spin text-3xl" />
        </div>
      ) : participations.length === 0 ? (
        <div className="text-center py-20 text-[var(--text2)]">
          <i className="fas fa-star text-4xl mb-3 block text-[var(--border)]" />
          <p className="font-bold">참가 중인 대회가 없습니다</p>
          <p className="text-sm mt-1 text-[var(--text3)]">마라톤 일정에서 대회를 추가해보세요</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {participations.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-sm leading-snug text-[var(--navy)]">
                  {p.marathon.name}
                </h3>
                {p.marathon.isActive
                  ? <span className="badge-mint shrink-0">모집중</span>
                  : <span className="badge-gray shrink-0">마감</span>
                }
              </div>

              <div className="space-y-1 text-xs mb-3 text-[var(--text2)]">
                <div><i className="fas fa-calendar w-4" /> {p.marathon.date}</div>
                <div><i className="fas fa-map-marker-alt w-4" /> {p.marathon.location || p.marathon.city}</div>
                <div><i className="fas fa-running w-4" /> {p.category}</div>
                {p.finishTime && (
                  <div><i className="fas fa-clock w-4" /> 완주 {p.finishTime}</div>
                )}
                {p.raceNotes && (
                  <div className="mt-1 p-2 rounded-lg text-xs bg-[var(--surface2)] text-[var(--text2)]">
                    {p.raceNotes}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {p.marathon.officialUrl && (
                  <a
                    href={p.marathon.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-outline px-3 py-1.5 text-xs font-bold flex-1 text-center"
                  >
                    홈페이지
                  </a>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg flex-1 transition-colors border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]"
                >
                  <i className="fas fa-pen mr-1" />기록
                </button>
                <button
                  onClick={() =>
                    showConfirm(
                      '내 마라톤에서 제거',
                      `${p.marathon.name}을(를) 제거하시겠습니까?`,
                      () => delMut.mutate(p.id),
                    )
                  }
                  className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border border-[var(--border)] bg-[var(--surface)] text-red-500"
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 완주 기록 편집 모달 */}
      {editTarget !== null && (
        <div
          onClick={() => setEditTarget(null)}
          className="fixed inset-0 z-[60] bg-[rgba(27,45,64,0.45)] flex items-end justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
          >
            <h3 className="font-bold mb-4 text-[var(--navy)]">완주 기록 입력</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1 text-[var(--text2)]">
                  완주 시간 (H:MM:SS)
                </label>
                <input
                  className="input-dark w-full"
                  placeholder="예: 4:32:10"
                  value={form.finishTime}
                  onChange={e => setForm(f => ({ ...f, finishTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-[var(--text2)]">레이스 메모</label>
                <textarea
                  className="input-dark w-full resize-none"
                  rows={3}
                  placeholder="레이스 후기, 느낌 등..."
                  value={form.raceNotes}
                  onChange={e => setForm(f => ({ ...f, raceNotes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditTarget(null)}
                className="flex-1 btn-outline py-2.5 text-sm font-bold"
              >
                취소
              </button>
              <button
                onClick={submitEdit}
                disabled={updateMut.isPending}
                className="flex-1 btn-mint py-2.5 text-sm font-bold"
              >
                {updateMut.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
