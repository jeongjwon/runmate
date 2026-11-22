"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { api } from "@/src/lib/api";

interface Params {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
}

const PERMISSIONS = [
  { icon: "fa-person-running", text: "러닝 기록 조회 · 추가" },
  { icon: "fa-calendar-check", text: "훈련 계획 조회 · 저장 · 삭제" },
  { icon: "fa-shoe-prints", text: "신발 · 참가 대회 조회" },
];

function hostOf(uri?: string) {
  try {
    return new URL(uri ?? "").host;
  } catch {
    return "";
  }
}

export default function McpAuthorizePage({
  params,
  error,
  clientName,
  userName,
}: {
  params: Params;
  error: string | null;
  clientName: string;
  userName: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const app = clientName || "Claude";

  const decide = async (approve: boolean) => {
    setBusy(true);
    setFailed("");
    try {
      const res = await api.post<{ redirect: string }>("/oauth/authorize", {
        ...params,
        approve,
      });
      window.location.assign(res.redirect);
    } catch (e: any) {
      setFailed(e.message || "요청을 처리하지 못했습니다");
      setBusy(false);
    }
  };

  // 로그인 후 같은 동의 화면으로 돌아오도록 현재 주소를 그대로 넘김
  const login = (provider: string) =>
    signIn(provider, { callbackUrl: window.location.href });

  return (
    <div className="max-w-sm mx-auto py-6">
      <div className="bg-white border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-center" style={{ background: "#0F2A3D" }}>
          <img
            src="/favicon.png"
            className="w-12 h-12 rounded-xl mx-auto mb-3"
            alt="RunMate"
          />
          <h1 className="text-lg font-extrabold text-white tracking-tight">
            Claude 연결
          </h1>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            RUNMATE 계정을 Claude 커넥터에 연결합니다
          </p>
        </div>

        {error ? (
          <div className="px-6 py-6 text-center">
            <i className="fas fa-triangle-exclamation text-2xl text-[#c2410c]" />
            <p className="mt-3 text-sm font-bold text-[var(--navy)]">
              연결 요청이 올바르지 않습니다
            </p>
            <p className="mt-1.5 text-xs text-[var(--text2)]">{error}</p>
          </div>
        ) : !userName ? (
          <div className="px-6 py-5 space-y-2.5">
            <p className="pb-1 text-center text-[13px] text-[var(--text2)]">
              <b className="text-[var(--navy)]">{app}</b>에 연결하려면 먼저
              로그인해 주세요.
            </p>
            <button
              onClick={() => login("google")}
              className="flex justify-center items-center gap-3 w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-white hover:bg-[#f8f9fa] font-semibold text-sm text-[#3c4043] transition-colors"
            >
              <img
                src="https://www.google.com/favicon.ico"
                className="w-5 h-5"
                alt=""
              />
              Google로 로그인
            </button>
            <button
              onClick={() => login("kakao")}
              className="flex justify-center items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
              style={{ background: "#FEE500", color: "#3C1E1E" }}
            >
              <img
                src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
                className="w-5 h-5 rounded"
                alt=""
              />
              카카오로 로그인
            </button>
            <button
              onClick={() => login("naver")}
              className="flex justify-center items-center gap-3 w-full px-4 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
              style={{ background: "#03C75A", color: "white" }}
            >
              <span
                className="w-5 h-5 flex items-center justify-center font-black text-xs rounded"
                style={{ background: "white", color: "#03C75A" }}
              >
                N
              </span>
              네이버로 로그인
            </button>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-[13px] text-[var(--text)]">
              <b className="text-[var(--navy)]">{app}</b>이(가){" "}
              <b className="text-[var(--navy)]">{userName}</b> 님의 RunMate
              계정에 접근하려고 합니다.
            </p>
            <ul className="mt-3.5 space-y-2">
              {PERMISSIONS.map((p) => (
                <li
                  key={p.text}
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--surface2)] border border-[var(--border)] rounded-xl text-[13px] font-semibold text-[var(--navy)]"
                >
                  <i
                    className={`fas ${p.icon} w-4 text-center text-xs text-[var(--mint)]`}
                  />
                  {p.text}
                </li>
              ))}
            </ul>
            <p className="mt-3.5 text-[11.5px] text-[var(--text2)]">
              Claude에서 직접 커넥터 연결을 시작한 경우에만 허용하세요. 허용하면{" "}
              <b>{hostOf(params.redirect_uri)}</b>(으)로 돌아갑니다. 연결은
              프로필 메뉴의 ‘Claude 연동’에서 언제든 해제할 수 있습니다.
            </p>
            {failed && (
              <p role="alert" className="mt-3 text-xs text-red-500">
                {failed}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => decide(false)}
                disabled={busy}
                className="btn-outline flex-1 py-2.5 text-sm font-bold"
              >
                거부
              </button>
              <button
                onClick={() => decide(true)}
                disabled={busy}
                className="btn-mint flex-1 justify-center py-2.5 text-sm"
              >
                {busy ? "처리 중…" : "허용"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
