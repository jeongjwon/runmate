"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { api } from "@/src/lib/api";
import { User } from "@/src/types";

const SIDEBAR_BG = "#0F2A3D";

export default function Nav() {
  const pathname = usePathname();

  const { data } = useQuery<{ user: User | null }>({
    queryKey: ["me"],
    queryFn: () => api.get("/me"),
    staleTime: Infinity,
  });
  const user = data?.user;

  const navLinks = [
    { to: "/", icon: "fa-home", label: "홈" },
    { to: "/marathons-list", icon: "fa-flag-checkered", label: "마라톤" },
    ...(user
      ? [
          { to: "/participations", icon: "fa-trophy", label: "내 대회" },
          { to: "/activity", icon: "fa-person-running", label: "활동" },
          { to: "/stats", icon: "fa-chart-line", label: "통계" },
        ]
      : []),
  ];

  // 실제 라우트는 / 가 마라톤 목록이므로 보정
  const resolvedLinks = [
    { to: "/", icon: "fa-flag-checkered", label: "마라톤" },
    ...(user
      ? [
          { to: "/participations", icon: "fa-trophy", label: "내 대회" },
          { to: "/activity", icon: "fa-person-running", label: "활동" },
          { to: "/stats", icon: "fa-chart-line", label: "통계" },
        ]
      : []),
  ];

  return (
    <>
      {/* ── 데스크톱 사이드바 ── */}
      <aside
        className="hidden sm:flex flex-col w-52 shrink-0 h-screen sticky top-0"
        style={{ background: SIDEBAR_BG }}
      >
        {/* 로고 */}
        <div className="px-5 pt-6 pb-5">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="../favicon.png"
              className="w-8 h-8 rounded-xl"
              alt="logo"
            />
            <span className="font-extrabold text-white tracking-tight text-base">
              RUN<span style={{ color: "#00c896" }}>MATE</span>
            </span>
          </Link>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 space-y-0.5 mt-1">
          {resolvedLinks.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                href={l.to}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all"
                style={{
                  color: active ? "#fff" : "rgba(255,255,255,0.45)",
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255,255,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                }}
              >
                <i
                  className={`fas ${l.icon} w-4 text-center text-[13px]`}
                  style={{
                    color: active ? "#00c896" : "rgba(255,255,255,0.35)",
                  }}
                />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 사용자 영역 */}
        <div
          className="px-3 pb-5 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          {user ? (
            <div
              className="flex items-center gap-2.5 px-2 py-2 rounded-xl group"
              style={{ cursor: "default" }}
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                  alt={user.name}
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0"
                  style={{ background: "#00c896" }}
                >
                  {user.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {user.name}
                </p>
                {user.email && (
                  <p
                    className="text-[0.6rem] truncate"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    {user.email}
                  </p>
                )}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                title="로그아웃"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#f87171";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color =
                    "rgba(255,255,255,0.4)";
                }}
              >
                <i className="fas fa-sign-out-alt text-xs" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-semibold"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              <i className="fas fa-sign-in-alt text-xs" />
              로그인
            </Link>
          )}
        </div>
      </aside>

      {/* ── 모바일 하단 탭바 ── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 border-t border-[var(--border)] z-40 bg-white">
        <div className="flex">
          {resolvedLinks.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                href={l.to}
                className="flex-1 flex flex-col items-center py-3 gap-0.5"
                style={{ color: active ? "#00c896" : "#9aacb8" }}
              >
                <i className={`fas ${l.icon} text-base`} />
                <span className="text-[9px] font-bold">{l.label}</span>
              </Link>
            );
          })}
          {!user && (
            <Link
              href="/login"
              className="flex-1 flex flex-col items-center py-3 gap-0.5"
              style={{ color: "#9aacb8" }}
            >
              <i className="fas fa-sign-in-alt text-base" />
              <span className="text-[9px] font-bold">로그인</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
