import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BADGE_DEFINITIONS = [
  // monthly_km
  { code: 'monthly_50km',  type: 'monthly_km',    name: '스타터',    description: '한 달에 50km 달성',   icon: '🥉', threshold: 50,  unit: 'km' },
  { code: 'monthly_100km', type: 'monthly_km',    name: '꾸준러',    description: '한 달에 100km 달성',  icon: '🥈', threshold: 100, unit: 'km' },
  { code: 'monthly_150km', type: 'monthly_km',    name: '챌린저',    description: '한 달에 150km 달성',  icon: '🥇', threshold: 150, unit: 'km' },
  { code: 'monthly_200km', type: 'monthly_km',    name: '마스터',    description: '한 달에 200km 달성',  icon: '🏆', threshold: 200, unit: 'km' },
  // streak
  { code: 'streak_7d',     type: 'streak',        name: '7일 연속',  description: '7일 연속 러닝',        icon: '🔥', threshold: 7,   unit: 'days' },
  { code: 'streak_30d',    type: 'streak',        name: '한 달 연속', description: '30일 연속 러닝',      icon: '⚡', threshold: 30,  unit: 'days' },
  // personal_best
  { code: 'pb_distance',   type: 'personal_best', name: '최장거리',  description: '최장 거리 신기록',     icon: '📏', threshold: 0,   unit: 'km' },
  { code: 'pb_pace',       type: 'personal_best', name: '최고페이스', description: '최고 페이스 신기록',  icon: '⚡', threshold: 0,   unit: '/km' },
  { code: 'pb_duration',   type: 'personal_best', name: '최장시간',  description: '최장 러닝 시간 신기록', icon: '⏱️', threshold: 0,   unit: 'min' },
]

async function main() {
  for (const def of BADGE_DEFINITIONS) {
    await prisma.badgeDefinition.upsert({
      where: { code: def.code },
      update: { name: def.name, description: def.description, icon: def.icon, threshold: def.threshold, unit: def.unit },
      create: def,
    })
  }
  console.log(`✅ ${BADGE_DEFINITIONS.length}개 배지 정의 seed 완료`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
