import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '문의',
  description: 'RunMate 서비스 문의 및 피드백 안내',
}

const FAQS = [
  {
    q: '마라톤 대회 정보가 최신이 아닌 것 같아요.',
    a: '대회 정보는 roadrun.co.kr에서 주기적으로 수집됩니다. 정보 불일치가 발견되면 이메일로 알려주시면 빠르게 확인하겠습니다.',
  },
  {
    q: '소셜 로그인이 되지 않아요.',
    a: '브라우저 팝업 차단이 활성화된 경우 로그인이 안 될 수 있습니다. 팝업을 허용한 뒤 다시 시도해 주세요.',
  },
  {
    q: 'TCX 파일 임포트가 실패합니다.',
    a: 'Garmin, Polar 등 GPS 기기에서 내보낸 TCX 형식을 지원합니다. 파일이 손상되었거나 형식이 다른 경우 임포트가 실패할 수 있습니다.',
  },
  {
    q: '내 러닝 기록이 삭제되었어요.',
    a: '계정과 기록은 서버에 안전하게 저장됩니다. 문제가 발생했다면 이메일로 문의해 주시면 확인해 드리겠습니다.',
  },
]

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-xl font-extrabold text-[var(--navy)]">문의</h1>
        <p className="text-xs text-[var(--text3)] mt-1">
          서비스 이용 중 불편한 점이나 개선 의견을 자유롭게 전달해 주세요.
        </p>
      </div>

      {/* Contact card */}
      <div className="rounded-2xl border border-[var(--border)] p-6 bg-white space-y-5">
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,200,150,0.1)' }}
          >
            <i className="fas fa-envelope text-[var(--mint)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--navy)]">이메일 문의</p>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              버그 신고, 기능 제안, 데이터 오류 등 모든 문의를 받습니다.
            </p>
            <a
              href="mailto:zlzlsksk111@gmail.com"
              className="inline-block mt-2 text-sm font-semibold text-[var(--mint)] hover:underline"
            >
              zlzlsksk111@gmail.com
            </a>
          </div>
        </div>

        <div className="border-t border-[var(--border)]" />

        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,200,150,0.1)' }}
          >
            <i className="fab fa-github text-[var(--mint)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--navy)]">GitHub Issues</p>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              버그 리포트나 기능 제안은 GitHub 이슈로도 남겨 주실 수 있습니다.
            </p>
            <a
              href="https://github.com/jeongjwon/runmate/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm font-semibold text-[var(--mint)] hover:underline"
            >
              github.com/jeongjwon/runmate
            </a>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-sm font-extrabold text-[var(--navy)] uppercase tracking-wider mb-3">자주 묻는 질문</h2>
        <div className="space-y-2">
          {FAQS.map((item) => (
            <div key={item.q} className="rounded-xl border border-[var(--border)] p-4 bg-white">
              <p className="text-sm font-semibold text-[var(--navy)] mb-1.5">Q. {item.q}</p>
              <p className="text-xs text-[var(--text2)] leading-relaxed">A. {item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--text3)] text-center">
        문의 내용은 영업일 기준 1~3일 이내 답변 드립니다.
      </p>
    </div>
  )
}
