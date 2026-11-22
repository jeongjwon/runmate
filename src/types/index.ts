export interface User {
  id: number
  name: string
  email?: string
  picture?: string
  provider: string
}

export interface Marathon {
  id: number
  name: string
  date: string
  location: string
  city: string
  categories: string
  description: string
  officialUrl: string
  entryFee: number
  maxParticipants: number
  isActive: boolean
  createdBy?: number | null // 직접 추가한 대회면 추가한 사용자 id
}

export interface Participation {
  id: number
  userId: number
  marathonId: number
  category: string
  finishTime?: string
  goalTime?: string // 목표 기록 "H:MM:SS"
  raceNotes?: string
  certificateUrl?: string
  marathon: Marathon
  createdAt: string
}

export interface Activity {
  id: number
  date: string
  distance: number
  duration: number // 이동 시간(초). 정지 시간 제외
  elapsed?: number | null // 총 경과 시간(초). 모르면 null
  externalId?: string | null // 워치 활동 고유 ID (TCX 의 Activity/Id)
  duration_formatted: string
  pace: string
  heartRate: number
  maxHeartRate: number
  calories: number
  routeType: string
  runType: string
  weather: string
  notes: string
  routeData?: string
  shoeId?: number | null
}

export interface Shoe {
  id: number
  name: string
  brand: string
  model: string
  purpose: string // 용도 메모
  startKm: number
  retired: boolean
  km: number // startKm + 이 신발로 저장한 기록의 거리 합
  runs: number
}

export type PlanKind = 'run' | 'strength' | 'both' | 'rest'

export interface TrainingPlan {
  id: number
  date: string // YYYY-MM-DD
  kind: PlanKind
  title: string
  detail: string
  done: boolean
}
