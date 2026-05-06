'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/src/lib/api'
import { supabase } from '@/src/lib/supabase'
import { Participation } from '@/src/types'
import { useUI } from '@/src/context/UIContext'

interface ParticipationsResponse { data: Participation[] }

const FINISH_TIME_REGEX = /^\d{1,2}:\d{2}:\d{2}$/
const CATS = ['5K', '10K', 'Half', 'Full', '기타']

type EditForm = {
  category: string
  finishTime: string
  raceNotes: string
  certificateUrl: string
}

function dday(dateStr: string) {
  const race = new Date(dateStr.replace(/\./g, '-'))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((race.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'D-DAY'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

export default function ParticipationsPage() {
  const qc = useQueryClient()
  const { showSnackbar, showConfirm } = useUI()

  const [editTarget, setEditTarget] = useState<Participation | null>(null)
  const [form, setForm] = useState<EditForm>({ category: '', finishTime: '', raceNotes: '', certificateUrl: '' })
  const [uploading, setUploading] = useState(false)

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
    setEditTarget(p)
    setForm({
      category: p.category ?? '',
      finishTime: p.finishTime ?? '',
      raceNotes: p.raceNotes ?? '',
      certificateUrl: p.certificateUrl ?? '',
    })
  }

  const handleCertUpload = async (file: File) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `certificates/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('certificates').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('certificates').getPublicUrl(path)
      setForm(f => ({ ...f, certificateUrl: urlData.publicUrl }))
      showSnackbar('기록증 업로드 완료')
    } catch {
      showSnackbar('업로드 실패. Supabase Storage 버킷을 확인해주세요', 'error')
    } finally {
      setUploading(false)
    }
  }

  const submitEdit = () => {
    if (!editTarget) return
    if (!form.category) { showSnackbar('종목을 선택해주세요', 'error'); return }
    if (!form.finishTime) { showSnackbar('완주 시간을 입력해주세요', 'error'); return }
    if (!FINISH_TIME_REGEX.test(form.finishTime)) { showSnackbar('완주시간 형식: H:MM:SS (예: 4:32:10)', 'error'); return }
    updateMut.mutate({
      marathonId: editTarget.marathonId,
      body: { category: form.category, finish_time: form.finishTime, race_notes: form.raceNotes, certificate_url: form.certificateUrl },
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-5 flex items-center gap-2 text-[var(--navy)]">
        <i className="fas fa-star text-[var(--mint)]" />내 마라톤
      </h1>

      {isLoading ? (
        <div className="text-center py-20 text-[var(--text3)]"><i className="fas fa-spinner fa-spin text-3xl" /></div>
      ) : participations.length === 0 ? (
        <div className="text-center py-20 text-[var(--text2)]">
          <i className="fas fa-star text-4xl mb-3 block text-[var(--border)]" />
          <p className="font-bold">참가 중인 대회가 없습니다</p>
          <p className="text-sm mt-1 text-[var(--text3)]">마라톤 일정에서 대회를 추가해보세요</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {participations.map(p => {
            const finished = !!p.finishTime
            return (
              <div key={p.id} className={`rounded-2xl overflow-hidden shadow-md flex flex-col ${finished ? 'bg-[var(--navy)]' : 'bg-[var(--surface)]'}`}>

                {/* 티켓 상단 */}
                <div className={`px-5 pt-5 pb-4 relative ${finished ? '' : ''}`}>
                  {/* 상태 라벨 */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full ${
                      finished
                        ? 'bg-[var(--mint)] text-white'
                        : 'bg-[var(--surface2)] text-[var(--text3)]'
                    }`}>
                      {finished ? '🏅 Finisher' : '🎽 참가 예정'}
                    </span>
                    {p.category && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        finished ? 'border-white/20 text-white/70' : 'border-[var(--border)] text-[var(--text3)]'
                      }`}>
                        {p.category}
                      </span>
                    )}
                  </div>

                  {/* 대회명 */}
                  <h3 className={`font-extrabold text-base leading-snug mb-3 ${finished ? 'text-white' : 'text-[var(--navy)]'}`}>
                    {p.marathon.name}
                  </h3>

                  {/* 날짜 / 장소 */}
                  <div className={`space-y-1 text-xs ${finished ? 'text-white/60' : 'text-[var(--text2)]'}`}>
                    <div className="flex items-center gap-2">
                      <i className="fas fa-calendar-alt w-3.5" />{p.marathon.date}
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="fas fa-map-marker-alt w-3.5" />{p.marathon.location || p.marathon.city}
                    </div>
                  </div>
                </div>

                {/* 티켓 중간 점선 분리선 */}
                <div className="relative flex items-center">
                  <div className={`w-5 h-5 rounded-full shrink-0 -ml-2.5 ${finished ? 'bg-[var(--bg)]' : 'bg-[var(--bg)]'}`} />
                  <div className={`flex-1 border-t-2 border-dashed ${finished ? 'border-white/15' : 'border-[var(--border)]'}`} />
                  <div className={`w-5 h-5 rounded-full shrink-0 -mr-2.5 ${finished ? 'bg-[var(--bg)]' : 'bg-[var(--bg)]'}`} />
                </div>

                {/* 티켓 하단 */}
                <div className="px-5 py-4 flex-1 flex flex-col gap-3">
                  {finished ? (
                    /* 완주 기록 */
                    <div className="text-center py-1">
                      <p className="text-[10px] font-black tracking-widest text-white/40 uppercase mb-1">Finish Time</p>
                      <p className="text-3xl font-black text-white tracking-tight">{p.finishTime}</p>
                      {p.raceNotes && (
                        <p className="text-xs text-white/50 mt-2 leading-relaxed line-clamp-2">{p.raceNotes}</p>
                      )}
                      {p.certificateUrl && (
                        <a href={p.certificateUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 mt-3 text-[var(--mint)] text-xs font-bold hover:underline">
                          <i className="fas fa-medal" />기록증 보기
                        </a>
                      )}
                    </div>
                  ) : (
                    /* 미완주 — D-DAY */
                    <div className="text-center py-1">
                      <p className="text-[10px] font-black tracking-widest text-[var(--text3)] uppercase mb-1">Race Day</p>
                      <p className="text-3xl font-black text-[var(--navy)] tracking-tight">{dday(p.marathon.date)}</p>
                    </div>
                  )}

                  {/* 액션 버튼 */}
                  <div className="flex gap-2 mt-auto pt-1">
                    {p.marathon.officialUrl && (
                      <a href={p.marathon.officialUrl} target="_blank" rel="noreferrer"
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg flex-1 text-center border transition-colors ${
                          finished
                            ? 'border-white/20 text-white/70 hover:bg-white/10'
                            : 'border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]'
                        }`}>
                        <i className="fas fa-external-link-alt mr-1" />홈페이지
                      </a>
                    )}
                    <button onClick={() => openEdit(p)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg flex-1 border transition-colors ${
                        finished
                          ? 'border-white/20 text-white/70 hover:bg-white/10'
                          : 'border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]'
                      }`}>
                      <i className="fas fa-pen mr-1" />기록 편집
                    </button>
                    <button
                      onClick={() => showConfirm('내 마라톤에서 제거', `${p.marathon.name}을(를) 제거하시겠습니까?`, () => delMut.mutate(p.id))}
                      className="p-1.5 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors">
                      <i className="fas fa-trash text-xs" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 기록 편집 모달 */}
      {editTarget && (
        <div onClick={() => setEditTarget(null)} className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-[var(--surface)] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-[var(--border)]">
              <h3 className="font-extrabold text-[var(--navy)]">기록 편집</h3>
              <p className="text-xs text-[var(--text3)] mt-0.5 truncate">{editTarget.marathon.name}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="flex items-center gap-1 text-xs font-bold mb-1.5 text-[var(--text2)]">
                  종목 <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                      className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${
                        form.category === c ? 'bg-[var(--mint)] text-white border-[var(--mint)]' : 'border-[var(--border)] text-[var(--text2)] hover:border-[var(--mint)]'
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1 text-xs font-bold mb-1.5 text-[var(--text2)]">
                  완주 시간 <span className="text-red-400">*</span>
                </label>
                <input className="input-dark w-full" placeholder="H:MM:SS (예: 4:32:10)"
                  value={form.finishTime} onChange={e => setForm(f => ({ ...f, finishTime: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">레이스 메모</label>
                <textarea className="input-dark w-full resize-none" rows={3} placeholder="레이스 후기, 느낌 등..."
                  value={form.raceNotes} onChange={e => setForm(f => ({ ...f, raceNotes: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">기록증</label>
                {form.certificateUrl ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--surface2)] border border-[var(--border)]">
                    <i className="fas fa-medal text-yellow-500" />
                    <a href={form.certificateUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--mint)] font-bold flex-1 truncate hover:underline">기록증 보기</a>
                    <button onClick={() => setForm(f => ({ ...f, certificateUrl: '' }))} className="text-[var(--text3)] hover:text-red-400 transition-colors">
                      <i className="fas fa-times text-xs" />
                    </button>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none border-[var(--border)]' : 'border-[var(--border)] hover:border-[var(--mint)]'}`}>
                    <i className={`fas ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-[var(--text3)] text-lg`} />
                    <span className="text-xs font-bold text-[var(--text3)]">{uploading ? '업로드 중...' : '이미지 또는 PDF 업로드'}</span>
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleCertUpload(f) }} />
                  </label>
                )}
              </div>
            </div>

            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setEditTarget(null)} className="flex-1 btn-outline py-2.5 text-sm font-bold">취소</button>
              <button onClick={submitEdit} disabled={updateMut.isPending} className="flex-1 btn-mint py-2.5 text-sm font-bold">
                {updateMut.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
