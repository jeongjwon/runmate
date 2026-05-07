import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: 'RunMate 개인정보처리방침',
}

const SECTIONS = [
  {
    title: '1. 수집하는 개인정보 항목',
    content: `RunMate는 소셜 로그인(Google, Kakao, Naver)을 통해 아래 항목을 수집합니다.

• 필수 수집 항목: 이름(닉네임), 이메일 주소, 프로필 이미지 URL, 소셜 서비스 고유 식별자(Provider ID)
• 서비스 이용 과정에서 생성되는 정보: 러닝 기록(날짜, 거리, 시간, 페이스, 심박수, 경로), 마라톤 참가 기록, 마일스톤 배지 획득 이력`,
  },
  {
    title: '2. 개인정보의 수집·이용 목적',
    content: `수집한 개인정보는 다음 목적으로만 활용됩니다.

• 회원 식별 및 서비스 제공
• 러닝 기록 및 마라톤 참가 정보 저장·관리
• 통계·분석 기능 제공(개인 맞춤 통계 및 배지)
• 서비스 품질 개선 및 장애 대응`,
  },
  {
    title: '3. 개인정보의 보유·이용 기간',
    content: `회원 탈퇴 시 또는 수집·이용 목적이 달성된 후 즉시 해당 정보를 파기합니다. 단, 관계 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.

• 소비자 보호에 관한 법률: 계약·청약철회 기록 5년, 대금결제·공급 기록 5년
• 전자상거래 등에서의 소비자보호에 관한 법률: 소비자 불만·분쟁처리 기록 3년`,
  },
  {
    title: '4. 개인정보의 제3자 제공',
    content: `RunMate는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래 경우에는 예외입니다.

• 이용자가 사전에 동의한 경우
• 법령의 규정에 의거하거나 수사기관의 적법한 요청이 있는 경우`,
  },
  {
    title: '5. 개인정보 처리 위탁',
    content: `RunMate는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁합니다.

• 수탁업체: Supabase Inc. / 위탁 업무: 데이터베이스 저장 및 관리
• 수탁업체: Vercel Inc. / 위탁 업무: 웹 서버 호스팅

위탁 업체들은 개인정보보호 관련 법규를 준수합니다.`,
  },
  {
    title: '6. 개인정보의 파기',
    content: `보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.

• 전자적 파일: 복구·재생이 불가능한 기술적 방법으로 삭제
• 종이 문서: 분쇄기로 분쇄하거나 소각

회원 탈퇴는 서비스 내 계정 설정에서 직접 요청하거나 이메일(zlzlsksk111@gmail.com)로 문의하시면 처리해 드립니다.`,
  },
  {
    title: '7. 이용자의 권리와 행사 방법',
    content: `이용자는 언제든지 아래 권리를 행사할 수 있습니다.

• 개인정보 열람 요청
• 오류가 있는 경우 정정 요청
• 삭제(탈퇴) 요청
• 처리 정지 요청

권리 행사는 이메일(zlzlsksk111@gmail.com)로 요청하시면 지체 없이 처리하겠습니다.`,
  },
  {
    title: '8. 쿠키 및 세션 사용',
    content: `RunMate는 로그인 상태 유지를 위해 세션 쿠키를 사용합니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 이 경우 로그인이 필요한 기능을 이용하지 못할 수 있습니다.`,
  },
  {
    title: '9. 개인정보 보호책임자',
    content: `개인정보 처리에 관한 업무를 총괄하고 관련 불만 처리 및 피해구제를 담당합니다.

• 개인정보 보호책임자: RunMate 운영팀
• 이메일: zlzlsksk111@gmail.com`,
  },
  {
    title: '10. 방침 변경 고지',
    content: `본 방침은 법령·정책 변경 또는 서비스 내용 변경에 따라 수정될 수 있습니다. 변경 시 서비스 공지사항 또는 이메일을 통해 사전 고지합니다.

• 시행일: 2025년 1월 1일
• 최종 수정일: 2025년 5월 1일`,
  },
]

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-xl font-extrabold text-[var(--navy)]">개인정보처리방침</h1>
        <p className="text-xs text-[var(--text3)] mt-1">
          RunMate(이하 "서비스")는 이용자의 개인정보를 소중히 여기며 「개인정보 보호법」을 준수합니다.
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

      <p className="text-xs text-[var(--text3)] text-center">
        문의: <a href="mailto:zlzlsksk111@gmail.com" className="text-[var(--mint)] hover:underline">zlzlsksk111@gmail.com</a>
      </p>
    </div>
  )
}
