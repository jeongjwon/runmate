import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '서비스 소개',
  description: 'RunMate — 국내 마라톤 일정 조회, 참가 신청, 러닝 기록 관리 서비스 소개',
}

const FEATURES = [
  {
    icon: 'fa-flag-checkered',
    title: '마라톤 일정 조회',
    desc: '전국 마라톤 대회 일정을 한눈에 확인하세요. 지역·종목별 필터로 나에게 맞는 대회를 빠르게 찾을 수 있습니다.',
  },
  {
    icon: 'fa-trophy',
    title: '내 대회 관리',
    desc: '관심 있는 대회를 저장하고 완주 기록과 메모를 남기세요. 나만의 마라톤 완주 이력을 한 곳에서 관리할 수 있습니다.',
  },
  {
    icon: 'fa-person-running',
    title: '러닝 기록 관리',
    desc: '날짜별 러닝 기록을 입력하거나 TCX·CSV 파일을 임포트하세요. 거리, 페이스, 심박수, 경로를 체계적으로 기록합니다.',
  },
  {
    icon: 'fa-chart-line',
    title: '통계 & 분석',
    desc: '활동 히트맵, 월별 거리 비교, 페이스 추이 등 다양한 차트로 나의 러닝 패턴을 분석할 수 있습니다.',
  },
  {
    icon: 'fa-medal',
    title: '마일스톤 배지',
    desc: '월간 달성 거리에 따라 자동으로 배지를 획득합니다. 50km·100km·150km·200km 마일스톤을 달성해보세요.',
  },
  {
    icon: 'fa-map',
    title: 'GPS 경로 시각화',
    desc: 'TCX 파일을 임포트하면 러닝 경로를 지도 위에서 확인할 수 있습니다.',
  },
]

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-10 py-4">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <img src="/favicon.png" className="w-16 h-16 rounded-2xl" alt="RunMate" />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--navy)]">
          RUN<span className="text-[var(--mint)]">MATE</span>
        </h1>
        <p className="text-sm text-[var(--text2)] leading-relaxed">
          RunMate는 국내 마라톤 대회 일정 조회부터 참가 신청, 러닝 기록 관리까지<br className="hidden sm:block" />
          달리기와 관련된 모든 것을 한 곳에서 관리할 수 있는 서비스입니다.
        </p>
      </div>

      {/* Features */}
      <div>
        <h2 className="text-sm font-extrabold text-[var(--navy)] uppercase tracking-wider mb-4">주요 기능</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex gap-3 p-4 rounded-2xl border border-[var(--border)] bg-white"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,200,150,0.1)' }}
              >
                <i className={`fas ${f.icon} text-sm text-[var(--mint)]`} />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--navy)] mb-0.5">{f.title}</p>
                <p className="text-xs text-[var(--text3)] leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data source */}
      <div className="rounded-2xl border border-[var(--border)] p-5 bg-white">
        <h2 className="text-sm font-extrabold text-[var(--navy)] mb-2">마라톤 데이터 출처</h2>
        <p className="text-xs text-[var(--text2)] leading-relaxed">
          마라톤 대회 정보는{' '}
          <span className="font-semibold text-[var(--navy)]">roadrun.co.kr</span>에서
          수집됩니다. 대회 정보의 정확성은 원본 사이트를 기준으로 하며,
          RunMate는 정보 제공 목적으로만 해당 데이터를 활용합니다.
          공식 참가 신청은 반드시 각 대회 공식 홈페이지에서 진행해 주세요.
        </p>
      </div>

      {/* Version */}
      <div className="text-center text-xs text-[var(--text3)]">
        RunMate v1.0 · Next.js 14 · PostgreSQL · Prisma
      </div>
    </div>
  )
}
