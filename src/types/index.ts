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
}

export interface Participation {
  id: number
  userId: number
  marathonId: number
  category: string
  finishTime?: string
  raceNotes?: string
  certificateUrl?: string
  marathon: Marathon
  createdAt: string
}

export interface Activity {
  id: number
  date: string
  distance: number
  duration: number
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
