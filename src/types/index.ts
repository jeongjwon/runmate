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

export interface RunningRecord {
  id: number
  date: string
  distance: number
  duration: number
  duration_formatted: string
  pace: string
  heartRate: number
  calories: number
  routeType: string
  weather: string
  notes: string
  routeData?: string
}
