"use client";

import { signIn } from "next-auth/react";
export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="card p-8 w-full max-w-sm text-center">
        <img
          src="/favicon.png"
          className="w-16 h-16 rounded-2xl mx-auto mb-4"
          alt="RunMate logo"
        />
        <h1 className="text-2xl font-extrabold mb-1 text-[var(--navy)]">
          RUN<span className="text-[var(--mint)]">MATE</span>
        </h1>
        <p className="text-sm mb-8 text-[var(--text3)]">
          러닝 기록을 한 곳에서 관리하세요
        </p>

        <div className="space-y-3">
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-[var(--border)] font-semibold text-sm transition-colors hover:bg-gray-50 text-[var(--text)]"
          >
            <img
              src="https://www.google.com/favicon.ico"
              className="w-5 h-5"
              alt="Google"
            />
            Google로 로그인
          </button>
          <button
            onClick={() => signIn("kakao", { callbackUrl: "/" })}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm bg-[#FEE500] text-[#3C1E1E]"
          >
            <img
              src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
              className="w-5 h-5 rounded"
              alt="Kakao"
            />
            카카오로 로그인
          </button>
          <button
            onClick={() => signIn("naver", { callbackUrl: "/" })}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm text-white bg-[#03C75A]"
          >
            <span className="w-5 h-5 flex items-center justify-center font-black text-xs rounded bg-white text-[#03C75A]">
              N
            </span>
            네이버로 로그인
          </button>
        </div>
      </div>
    </div>
  );
}
