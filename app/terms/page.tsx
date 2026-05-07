import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이용약관',
  description: 'RunMate 서비스 이용약관',
}

const SECTIONS = [
  {
    title: '제1조 (목적)',
    content: `본 약관은 RunMate(이하 "서비스")가 제공하는 마라톤 일정 조회, 러닝 기록 관리 등 제반 서비스의 이용 조건 및 절차, 이용자와 서비스 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.`,
  },
  {
    title: '제2조 (정의)',
    content: `① "서비스"란 RunMate가 제공하는 마라톤 일정 조회, 참가 신청 관리, 러닝 기록 관리, 통계·배지 기능 등 일체의 서비스를 의미합니다.
② "이용자"란 본 약관에 동의하고 서비스를 이용하는 자를 말합니다.
③ "계정"이란 소셜 로그인(Google, Kakao, Naver)을 통해 생성된 이용자 식별 정보를 말합니다.`,
  },
  {
    title: '제3조 (약관의 효력 및 변경)',
    content: `① 본 약관은 서비스 화면에 게시하거나 이용자에게 이메일로 공지함으로써 효력이 발생합니다.
② 서비스는 필요한 경우 약관을 변경할 수 있으며, 변경 시 변경 내용과 시행일을 사전에 공지합니다.
③ 이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.`,
  },
  {
    title: '제4조 (서비스 이용)',
    content: `① 서비스 이용은 소셜 로그인 후 24시간 제공함을 원칙으로 합니다.
② 서비스는 시스템 점검, 장애, 천재지변 등 불가피한 사유로 일시 중단될 수 있습니다.
③ 마라톤 대회 정보는 roadrun.co.kr에서 수집되며, 정확성은 원본 사이트를 기준으로 합니다. 공식 참가 신청은 각 대회 공식 홈페이지에서 진행하시기 바랍니다.`,
  },
  {
    title: '제5조 (이용자의 의무)',
    content: `이용자는 다음 행위를 해서는 안 됩니다.

• 타인의 정보를 도용하거나 허위 정보를 등록하는 행위
• 서비스의 정상적인 운영을 방해하는 행위
• 서비스를 통해 얻은 정보를 서비스의 사전 동의 없이 복제·배포·상업적으로 이용하는 행위
• 관련 법령을 위반하는 행위`,
  },
  {
    title: '제6조 (개인정보 보호)',
    content: `서비스는 이용자의 개인정보를 「개인정보 보호법」 및 별도 개인정보처리방침에 따라 보호합니다. 자세한 내용은 개인정보처리방침을 확인해 주세요.`,
  },
  {
    title: '제7조 (서비스의 면책)',
    content: `① 서비스는 천재지변, 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.
② 마라톤 대회 정보의 오류·변경으로 인한 손해에 대해 서비스는 책임을 지지 않습니다. 공식 대회 정보는 반드시 해당 대회 주최 측을 통해 확인하세요.
③ 이용자가 서비스에 등록한 러닝 기록 등 데이터의 손실에 대해 서비스는 최선을 다하나, 불가피한 경우 책임을 지지 않을 수 있습니다.`,
  },
  {
    title: '제8조 (계정 탈퇴 및 서비스 해지)',
    content: `① 이용자는 언제든지 탈퇴를 요청할 수 있으며, 서비스는 지체 없이 처리합니다.
② 탈퇴 시 이용자의 모든 데이터(러닝 기록, 참가 이력, 배지 등)는 즉시 삭제되며 복구가 불가합니다.
③ 탈퇴 요청은 이메일(zlzlsksk111@gmail.com)로 문의해 주세요.`,
  },
  {
    title: '제9조 (분쟁 해결 및 준거법)',
    content: `① 서비스와 이용자 간 발생한 분쟁은 상호 협의하여 해결함을 원칙으로 합니다.
② 본 약관은 대한민국 법령에 따르며, 분쟁이 발생할 경우 관할 법원은 민사소송법에 따릅니다.`,
  },
]

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-xl font-extrabold text-[var(--navy)]">이용약관</h1>
        <p className="text-xs text-[var(--text3)] mt-1">
          RunMate 서비스를 이용하기 전에 본 약관을 주의 깊게 읽어 주세요.
        </p>
      </div>

      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-xl border border-[var(--border)] p-5 bg-white">
            <h2 className="text-sm font-bold text-[var(--navy)] mb-2">{s.title}</h2>
            <p className="text-xs text-[var(--text2)] leading-relaxed whitespace-pre-line">{s.content}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border)] p-4 bg-white text-center space-y-1">
        <p className="text-xs text-[var(--text3)]">시행일: 2025년 1월 1일</p>
        <p className="text-xs text-[var(--text3)]">
          문의:{' '}
          <a href="mailto:zlzlsksk111@gmail.com" className="text-[var(--mint)] hover:underline">
            zlzlsksk111@gmail.com
          </a>
        </p>
      </div>
    </div>
  )
}
