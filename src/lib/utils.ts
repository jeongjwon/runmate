export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function calcPace(distKm: number, durSec: number): string {
  if (!distKm || !durSec) return '—'
  const spk = durSec / distKm
  return `${Math.floor(spk / 60)}'${String(Math.round(spk % 60)).padStart(2, '0')}"`
}

export function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const weatherEmoji: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  windy: '💨',
}

export const routeLabels: Record<string, string> = {
  road: '로드',
  trail: '트레일',
  track: '트랙',
  treadmill: '러닝머신',
}

export const runTypeLabels: Record<string, string> = {
  easy: '이지런',
  long: '롱런',
  tempo: '지속주',
  interval: '인터벌',
  race: '대회',
}

// 주간 훈련 계획 종류별 표시 (칩 배경·글자색, 캘린더 점 색)
export const planKinds: Record<string, { label: string; bg: string; fg: string; pipBg: string; pipBd: string }> = {
  run:      { label: '러닝',      bg: 'rgba(0,200,150,0.14)', fg: '#00694f', pipBg: '#00c896',     pipBd: '#00c896' },
  strength: { label: '근력',      bg: '#e3e8ee',              fg: '#1b2d40', pipBg: '#1b2d40',     pipBd: '#1b2d40' },
  both:     { label: '러닝+근력', bg: 'rgba(0,200,150,0.14)', fg: '#00694f', pipBg: '#00c896',     pipBd: '#1b2d40' },
  rest:     { label: '휴식',      bg: '#eceff2',              fg: '#5a6e7e', pipBg: 'transparent', pipBd: '#8696a3' },
}

// "YYYY-MM-DD" 에 n일을 더한 날짜 문자열
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export const SHOE_LIMIT_KM = 600 // 신발 교체 기준 거리
