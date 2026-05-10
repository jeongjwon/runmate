"use client";

import { signIn } from "next-auth/react";
import { useUI } from "@/src/context/UIContext";

export default function LoginModal() {
  const { loginModal, closeLogin } = useUI();
  if (!loginModal) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(15,42,61,0.55)", backdropFilter: "blur(6px)" }}
      onClick={closeLogin}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 24px 64px rgba(15,42,61,0.25)" }}
      >
        {/* 상단 헤더 */}
        <div
          className="px-6 pt-6 pb-5 text-center relative"
          style={{ background: "#0F2A3D" }}
        >
          {/* 닫기 버튼 */}
          <button
            onClick={closeLogin}
            className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "rgba(255,255,255,0.45)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "white";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "rgba(255,255,255,0.45)";
            }}
          >
            <i className="fas fa-times text-xs" />
          </button>

          {/* 로고 */}
          <img
            src="/favicon.png"
            className="w-12 h-12 rounded-xl mx-auto mb-3"
            alt="RunMate"
          />
          <h2 className="text-lg font-extrabold text-white tracking-tight">
            RUN<span style={{ color: "#00c896" }}>MATE</span>
          </h2>
          <p
            className="text-xs mt-1"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            소셜 계정으로 간편하게 시작하세요
          </p>
        </div>

        {/* 로그인 버튼 */}
        <div className="px-6 py-5 space-y-2.5">
          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex justify-center items-center gap-3 w-full px-4 py-3 rounded-xl border font-semibold text-sm transition-colors"
            style={{ borderColor: "#e8eaed", color: "#3c4043" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#f8f9fa";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "white";
            }}
          >
            <img
              src="https://www.google.com/favicon.ico"
              className="w-5 h-5"
              alt="Google"
            />
            <span className="">Google로 로그인</span>
          </button>

          {/* Kakao */}
          <button
            onClick={() => signIn("kakao", { callbackUrl: "/" })}
            className="flex justify-center items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: "#FEE500", color: "#3C1E1E" }}
          >
            <img
              src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
              className="w-5 h-5 rounded"
              alt="Kakao"
            />
            <span className="">카카오로 로그인</span>
          </button>

          {/* Naver */}
          <button
            onClick={() => signIn("naver", { callbackUrl: "/" })}
            className="flex justify-center items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: "#03C75A", color: "white" }}
          >
            <span
              className="w-5 h-5 flex items-center justify-center font-black text-xs rounded"
              style={{ background: "white", color: "#03C75A" }}
            >
              N
            </span>
            <span className="">네이버로 로그인</span>
          </button>
        </div>

        {/* 하단 안내 */}
        <div className="px-6 pb-5 text-center">
          <p className="text-[10px]" style={{ color: "#b0bec5" }}>
            로그인 시 <span style={{ color: "#9aacb8" }}>이용약관</span> 및{" "}
            <span style={{ color: "#9aacb8" }}>개인정보처리방침</span>에
            동의합니다
          </p>
        </div>
      </div>
    </div>
  );
}
