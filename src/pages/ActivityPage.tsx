'use client'

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { api } from '@/src/lib/api'
import { RunningRecord } from '@/src/types'
import { formatDuration, calcPace, getMonday, toDateStr, weatherEmoji, routeLabels } from '@/src/lib/utils'
import { useUI } from '@/src/context/UIContext'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

// Dynamic import for Leaflet (SSR not supported)
const MapContainer = dynamic(
  () => import('react-leaflet').then(m => m.MapContainer),
  { ssr: false }
)

type Tab    = 'week' | 'month' | 'year' | 'all'
type Period = { type: Tab; key: string; label: string; monday?: Date; sunday?: Date; ym?: string; year?: string }

function buildPeriods(tab: Tab, records: RunningRecord[]): Period[] {
  const now = new Date()
  if (tab === 'week') {
    const mon = getMonday(now)
    return Array.from({ length: 5 }, (_, i) => {
      const monday = new Date(mon); monday.setDate(monday.getDate() - i * 7)
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6)
      const label = monday.getMonth() === sunday.getMonth()
        ? `${monday.getMonth()+1}월 ${monday.getDate()}일 – ${sunday.getDate()}일`
        : `${monday.getMonth()+1}월 ${monday.getDate()}일 – ${sunday.getMonth()+1}월 ${sunday.getDate()}일`
      return { type: 'week', key: toDateStr(monday), label, monday, sunday }
    })
  }
  if (tab === 'month') {
    const cur = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const set = new Set([cur, ...records.map(r => r.date.slice(0,7))])
    return Array.from(set).sort().reverse().map(ym => {
      const [y,m] = ym.split('-')
      return { type: 'month', key: ym, label: `${y}년 ${parseInt(m)}월`, ym }
    })
  }
  if (tab === 'year') {
    const cur = String(now.getFullYear())
    const set = new Set([cur, ...records.map(r => r.date.slice(0,4))])
    return Array.from(set).sort().reverse().map(yr => ({ type: 'year', key: yr, label: `${yr}년`, year: yr }))
  }
  return [{ type: 'all', key: 'all', label: '전체' }]
}

function filterByPeriod(records: RunningRecord[], p: Period): RunningRecord[] {
  if (p.type === 'all') return records
  if (p.type === 'week')  return records.filter(r => r.date >= toDateStr(p.monday!) && r.date <= toDateStr(p.sunday!))
  if (p.type === 'month') return records.filter(r => r.date.startsWith(p.ym!))
  if (p.type === 'year')  return records.filter(r => r.date.startsWith(p.year!))
  return records
}

function buildChart(p: Period, records: RunningRecord[]) {
  if (p.type === 'week') {
    const labels = ['월','화','수','목','금','토','일']
    const data   = [0,0,0,0,0,0,0]
    const monT   = p.monday!.getTime()
    records.forEach(r => {
      const diff = Math.round((new Date(r.date+'T00:00:00').getTime() - monT) / 86400000)
      if (diff >= 0 && diff <= 6) data[diff] += r.distance
    })
    return { labels, data }
  }
  if (p.type === 'month') {
    const [y,mo] = p.ym!.split('-').map(Number)
    const days   = new Date(y, mo, 0).getDate()
    const labels = Array.from({length:days}, (_,i) => String(i+1))
    const data   = Array(days).fill(0)
    records.forEach(r => {
      if (r.date.startsWith(p.ym!)) {
        const d = parseInt(r.date.slice(8,10))-1
        if (d >= 0 && d < days) data[d] += r.distance
      }
    })
    return { labels, data }
  }
  if (p.type === 'year') {
    const labels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
    const data   = Array(12).fill(0)
    records.forEach(r => {
      if (r.date.startsWith(p.year!)) data[parseInt(r.date.slice(5,7))-1] += r.distance
    })
    return { labels, data }
  }
  const ymap: Record<string,number> = {}
  records.forEach(r => { const y=r.date.slice(0,4); ymap[y]=(ymap[y]||0)+r.distance })
  const years = Object.keys(ymap).sort()
  return { labels: years.map(y=>y+'년'), data: years.map(y=>ymap[y]) }
}

function RecordForm({ record, onClose, onSaved }: {
  record?: RunningRecord; onClose: () => void; onSaved: () => void
}) {
  const { showSnackbar } = useUI()
  const [form, setForm] = useState({
    date:      record?.date ?? new Date().toISOString().split('T')[0],
    distance:  record?.distance ?? '',
    h: record ? Math.floor(record.duration/3600) : 0,
    m: record ? Math.floor((record.duration%3600)/60) : 0,
    s: record ? record.duration%60 : 0,
    heartRate: record?.heartRate ?? '',
    calories:  record?.calories  ?? '',
    routeType: record?.routeType ?? 'road',
    weather:   record?.weather   ?? '',
    notes:     record?.notes     ?? '',
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    const duration = `${form.h}:${String(form.m).padStart(2,'0')}:${String(form.s).padStart(2,'0')}`
    if (!form.date || !form.distance || (!form.h && !form.m && !form.s))
      return showSnackbar('날짜, 거리, 시간은 필수입니다', 'error')
    try {
      const body = {
        date: form.date,
        distance: Number(form.distance),
        duration,
        heart_rate: Number(form.heartRate) || 0,
        calories:   Number(form.calories)  || 0,
        route_type: form.routeType,
        weather:    form.weather,
        notes:      form.notes,
      }
      if (record) await api.put(`/records/${record.id}`, body)
      else        await api.post('/records', body)
      onSaved(); onClose()
      showSnackbar(record ? '기록이 수정되었습니다' : '기록이 저장되었습니다')
    } catch (e: any) { showSnackbar(e.message, 'error') }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[rgba(27,45,64,0.45)] flex items-end justify-center"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[var(--surface)] w-full max-w-lg rounded-t-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="modal-header px-5 py-4 flex justify-between items-center sticky top-0 rounded-t-2xl">
          <h2 className="text-base font-bold text-[var(--navy)]">
            {record ? '러닝 기록 수정' : '러닝 기록 추가'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--border)] text-[var(--text2)]"
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">날짜 *</label>
              <input type="date" value={form.date} onChange={set('date')} className="input-dark" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">코스 유형</label>
              <select value={form.routeType} onChange={set('routeType')} className="input-dark">
                <option value="road">🛣️ 로드</option>
                <option value="trail">🌲 트레일</option>
                <option value="track">🏟️ 트랙</option>
                <option value="treadmill">🏃 러닝머신</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">거리 (km) *</label>
              <input
                type="number" step="0.01" placeholder="5.00"
                value={form.distance} onChange={set('distance')} className="input-dark"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">시간 *</label>
              <div className="flex gap-1 items-center">
                <input
                  type="number" min={0} max={23} placeholder="0"
                  value={form.h} onChange={set('h')} className="input-dark text-center px-1"
                />
                <span className="text-[var(--text3)] font-bold">:</span>
                <input
                  type="number" min={0} max={59} placeholder="00"
                  value={form.m} onChange={set('m')} className="input-dark text-center px-1"
                />
                <span className="text-[var(--text3)] font-bold">:</span>
                <input
                  type="number" min={0} max={59} placeholder="00"
                  value={form.s} onChange={set('s')} className="input-dark text-center px-1"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">심박수 (bpm)</label>
              <input
                type="number" placeholder="150"
                value={form.heartRate} onChange={set('heartRate')} className="input-dark"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">날씨</label>
              <select value={form.weather} onChange={set('weather')} className="input-dark">
                <option value="">선택</option>
                <option value="sunny">☀️ 맑음</option>
                <option value="cloudy">☁️ 흐림</option>
                <option value="rainy">🌧️ 비</option>
                <option value="snowy">❄️ 눈</option>
                <option value="windy">💨 바람</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">메모</label>
            <textarea
              rows={2} placeholder="오늘 러닝 어땠나요?"
              value={form.notes} onChange={set('notes')} className="input-dark resize-none"
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-outline flex-1 py-2.5 text-sm font-bold">취소</button>
          <button onClick={save} className="btn-mint flex-1 justify-center py-2.5 text-sm">저장</button>
        </div>
      </div>
    </div>
  )
}

export default function ActivityPage() {
  const qc = useQueryClient()
  const { showSnackbar, showConfirm } = useUI()
  const [tab,     setTab]     = useState<Tab>('month')
  const [pidx,    setPidx]    = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editRec, setEditRec] = useState<RunningRecord | null>(null)
  const tcxRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery<{ data: RunningRecord[] }>({
    queryKey: ['records'],
    queryFn:  () => api.get('/records'),
  })
  const allRecords = data?.data ?? []

  const periods = useMemo(() => buildPeriods(tab, allRecords), [tab, allRecords])

  useEffect(() => { setPidx(0) }, [tab])

  const period   = periods[pidx] ?? periods[0]
  const filtered = useMemo(() => filterByPeriod(allRecords, period), [allRecords, period])
  const stats    = useMemo(() => {
    const dist = filtered.reduce((s, r) => s + r.distance, 0)
    const sec  = filtered.reduce((s, r) => s + r.duration, 0)
    return { dist, time: formatDuration(sec), pace: calcPace(dist, sec), count: filtered.length }
  }, [filtered])
  const chartData = useMemo(() => buildChart(period, allRecords), [period, allRecords])

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/records/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['records'] }); showSnackbar('기록이 삭제되었습니다') },
    onError: (e: Error) => showSnackbar(e.message, 'error'),
  })

  const reload = () => qc.invalidateQueries({ queryKey: ['records'] })

  const handleTCX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('tcx', file); fd.append('route_type', 'road')
    api.upload('/records/import/tcx', fd)
      .then(() => { reload(); showSnackbar('TCX 기록이 추가되었습니다') })
      .catch((err: any) => showSnackbar(err.message || 'TCX 업로드 실패', 'error'))
    e.target.value = ''
  }

  const maxDist  = Math.max(0, ...chartData.data)
  const barColors = chartData.data.map(v => v === maxDist && v > 0 ? '#4ECBA0' : 'rgba(78,203,160,.3)')

  return (
    <div>
      {/* 탭 */}
      <div className="-mx-4 -mt-6 sticky top-14 z-20 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex justify-center">
          <div className="flex gap-1 p-1 rounded-2xl bg-[var(--surface2)]">
            {(['week','month','year','all'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`act-tab ${tab === t ? 'active' : ''}`}
              >
                {{'week':'주','month':'월','year':'년','all':'전체'}[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 통계 + 차트 */}
      <div className="-mx-4 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-5">
          {/* 기간 네비게이터 */}
          <div className="flex items-center justify-between mb-4" style={{ minHeight: '2rem' }}>
            <button
              onClick={() => setPidx(i => Math.min(i+1, periods.length-1))}
              disabled={pidx >= periods.length-1 || tab === 'all'}
              className="bg-transparent border-none cursor-pointer p-2 rounded-full text-[var(--text3)]"
              style={{ opacity: pidx >= periods.length-1 || tab === 'all' ? 0.2 : 1 }}
            >
              <i className="fas fa-chevron-left text-xs" />
            </button>
            <span className="text-sm font-semibold text-[var(--text2)]">{period?.label}</span>
            <button
              onClick={() => setPidx(i => Math.max(i-1, 0))}
              disabled={pidx <= 0 || tab === 'all'}
              className="bg-transparent border-none cursor-pointer p-2 rounded-full text-[var(--text3)]"
              style={{ opacity: pidx <= 0 || tab === 'all' ? 0.2 : 1 }}
            >
              <i className="fas fa-chevron-right text-xs" />
            </button>
          </div>

          {/* 통계 + 차트 그리드 */}
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-4 sm:gap-8">
            {/* 통계 */}
            <div className="flex-1">
              <div className="mb-4">
                <div className="flex items-end gap-2" style={{ lineHeight: 1 }}>
                  <span
                    className="font-extrabold text-[var(--navy)]"
                    style={{ fontSize: 'clamp(3rem,10vw,4.5rem)', letterSpacing: '-.02em', lineHeight: 1 }}
                  >
                    {stats.dist > 0 ? stats.dist.toFixed(1) : '0'}
                  </span>
                  <span className="text-lg text-[var(--text3)] mb-1">km</span>
                </div>
                <div className="text-[0.625rem] text-[var(--text3)] uppercase tracking-widest mt-1.5">
                  총 거리
                </div>
              </div>
              <div
                className="grid grid-cols-3 border border-[var(--border)] rounded-[0.875rem] overflow-hidden bg-[var(--surface2)]"
              >
                {[
                  [stats.count, '러닝'],
                  [stats.pace,  '평균 페이스'],
                  [stats.count > 0 ? stats.time : '0:00', '시간'],
                ].map(([val, lbl], i) => (
                  <div
                    key={i}
                    className="py-3 text-center"
                    style={{ borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}
                  >
                    <div className="text-lg font-bold text-[var(--navy)]">{val as string}</div>
                    <div className="text-[0.625rem] text-[var(--text3)] mt-1">{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 차트 */}
            <div className="flex-1 relative" style={{ minHeight: 130 }}>
              {chartData.data.some(v => v > 0) ? (
                <Bar
                  data={{
                    labels: chartData.labels,
                    datasets: [{
                      data: chartData.data,
                      backgroundColor: barColors,
                      borderRadius: 4,
                      borderSkipped: 'bottom',
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: 'rgba(27,45,64,.92)',
                        titleColor: '#9aaab8',
                        bodyColor: '#fff',
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: { label: ctx => `${(ctx.raw as number).toFixed(1)} km` },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: { color: '#9aaab8', font: { size: 10 }, maxTicksLimit: 12 },
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(27,45,64,.05)' },
                        border: { display: false },
                        ticks: { display: false },
                      },
                    },
                  }}
                  style={{ position: 'absolute', inset: 0 }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[0.8125rem] text-[var(--text3)]">
                  이 기간에 기록이 없습니다
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 모든 활동 리스트 */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[0.75rem] font-extrabold text-[var(--text2)] uppercase tracking-wider">
              모든 활동
            </h2>
            {allRecords.length > 0 && (
              <span className="text-[0.75rem] font-semibold text-[var(--text3)]">{allRecords.length}개</span>
            )}
          </div>
          <div className="flex gap-1.5">
            <input ref={csvRef} type="file" accept=".csv" className="hidden"
              onChange={() => showSnackbar('CSV 기능 준비 중', 'info')} />
            <input ref={tcxRef} type="file" accept=".tcx" className="hidden" onChange={handleTCX} />
            <button
              onClick={() => csvRef.current?.click()}
              className="btn-outline px-2.5 py-1.5 text-xs font-bold flex items-center gap-1"
            >
              <i className="fas fa-file-csv" /><span className="hidden sm:inline"> CSV</span>
            </button>
            <button
              onClick={() => tcxRef.current?.click()}
              className="btn-outline px-2.5 py-1.5 text-xs font-bold flex items-center gap-1"
            >
              <i className="fas fa-route" /><span className="hidden sm:inline"> TCX</span>
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="btn-mint px-3 py-1.5 text-xs"
            >
              <i className="fas fa-plus" /><span className="hidden sm:inline"> 기록 추가</span>
            </button>
          </div>
        </div>

        {allRecords.length === 0 ? (
          <div className="text-center py-12">
            <i className="fas fa-person-running text-5xl text-[var(--border)] block mb-4" />
            <p className="font-bold text-[var(--text2)]">아직 기록이 없습니다</p>
            <p className="text-sm text-[var(--text3)] mt-1 mb-4">첫 러닝 기록을 추가해보세요</p>
            <button onClick={() => setAddOpen(true)} className="btn-mint">
              <i className="fas fa-plus text-sm" /> 기록 추가
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {allRecords.map(r => {
              const dow = ['일','월','화','수','목','금','토'][new Date(r.date+'T00:00:00').getDay()]
              const mon = parseInt(r.date.slice(5,7)), day = parseInt(r.date.slice(8,10))
              return (
                <div key={r.id} className="act-card p-3.5 sm:p-4 flex items-start gap-3">
                  <div
                    className="shrink-0 text-center rounded-xl px-2 py-1.5 min-w-[44px] bg-[rgba(78,203,160,0.1)]"
                  >
                    <div className="text-[0.5625rem] font-extrabold text-[var(--mint)] leading-none">{mon}월</div>
                    <div className="text-[1.375rem] font-black text-[var(--mint)] leading-tight">{day}</div>
                    <div className="text-[0.5rem] text-[var(--text3)] font-bold">{dow}요일</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap mb-1">
                      <span className="text-[1.375rem] font-extrabold text-[var(--navy)] leading-none">
                        {r.distance.toFixed(2)}
                      </span>
                      <span className="text-[0.8125rem] text-[var(--text2)]">km</span>
                      <span className="text-[var(--border)]">·</span>
                      <span className="text-[0.875rem] font-semibold text-[var(--text2)]">{r.duration_formatted}</span>
                      <span className="text-[var(--border)]">·</span>
                      <span className="text-[0.875rem] font-bold text-[var(--mint)]">{r.pace}/km</span>
                    </div>
                    <div className="text-[0.75rem] text-[var(--text3)] flex flex-wrap gap-x-3 gap-y-1">
                      {r.routeType && <span>{routeLabels[r.routeType] || r.routeType}</span>}
                      {r.heartRate > 0 && (
                        <span><i className="fas fa-heart text-red-400" /> {r.heartRate}bpm</span>
                      )}
                      {r.weather && <span>{weatherEmoji[r.weather] || ''}</span>}
                      {r.notes && (
                        <span className="text-[var(--text2)] max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {r.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setEditRec(r)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg btn-outline text-[0.75rem]"
                    >
                      <i className="fas fa-edit" />
                    </button>
                    <button
                      onClick={() =>
                        showConfirm('기록 삭제', '이 러닝 기록을 삭제하시겠습니까?', () => deleteMut.mutate(r.id))
                      }
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text2)] bg-transparent cursor-pointer text-[0.75rem] hover:border-red-500 hover:text-red-500 transition-colors"
                    >
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(addOpen || editRec) && (
        <RecordForm
          record={editRec ?? undefined}
          onClose={() => { setAddOpen(false); setEditRec(null) }}
          onSaved={reload}
        />
      )}
    </div>
  )
}
