export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="card p-8 w-full max-w-sm text-center">
        <img src="/favicon.png" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
        <h1 className="text-2xl font-extrabold mb-1" style={{ color: 'var(--navy)' }}>
          RUN<span style={{ color: 'var(--mint)' }}>MATE</span>
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text3)' }}>러닝 기록을 한 곳에서 관리하세요</p>

        <div className="space-y-3">
          <a href="/auth/google"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border font-semibold text-sm transition-colors hover:bg-gray-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" />
            Google로 로그인
          </a>
          <a href="/auth/kakao"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm"
            style={{ background: '#FEE500', color: '#3C1E1E' }}>
            <img src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png" className="w-5 h-5 rounded" />
            카카오로 로그인
          </a>
          <a href="/auth/naver"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: '#03C75A' }}>
            <span className="w-5 h-5 flex items-center justify-center font-black text-xs rounded" style={{ background: '#fff', color: '#03C75A' }}>N</span>
            네이버로 로그인
          </a>
        </div>
      </div>
    </div>
  )
}
