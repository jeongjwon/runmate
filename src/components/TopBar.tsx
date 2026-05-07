"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { api } from "@/src/lib/api";
import { User } from "@/src/types";
import { useUI } from "@/src/context/UIContext";

export default function TopBar() {
  const { openLogin } = useUI();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ user: User | null }>({
    queryKey: ["me"],
    queryFn: () => api.get("/me"),
    staleTime: Infinity,
  });
  const user = data?.user;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-center justify-end gap-2 h-11 mb-3">
      {/* 알림 벨 (추후 활성화) */}
      <button
        disabled
        className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text3)] opacity-40 cursor-not-allowed"
        title="알림 (준비 중)"
      >
        <i className="fas fa-bell text-sm" />
      </button>

      {user ? (
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full hover:bg-[var(--surface2)] pl-1 pr-2.5 py-1 transition-colors"
          >
            {user.picture ? (
              <img
                src={user.picture}
                className="w-7 h-7 rounded-full object-cover"
                alt={user.name}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: "#00c896" }}
              >
                {user.name[0]}
              </div>
            )}
            <span className="text-xs font-semibold text-[var(--navy)] hidden sm:block max-w-[80px] truncate">
              {user.name}
            </span>
            <i
              className={`fas fa-chevron-down text-[9px] text-[var(--text3)] transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-[var(--border)] rounded-2xl shadow-lg overflow-hidden z-50">
              {/* 프로필 헤더 */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
                {user.picture ? (
                  <img
                    src={user.picture}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                    alt={user.name}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ background: "#00c896" }}
                  >
                    {user.name[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--navy)] truncate">{user.name}</p>
                  {user.email && (
                    <p className="text-[10px] text-[var(--text3)] truncate">{user.email}</p>
                  )}
                </div>
              </div>

              {/* 메뉴 */}
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setOpen(false);
                    signOut({ callbackUrl: "/" });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-red-500 hover:bg-red-50 transition-colors font-semibold"
                >
                  <i className="fas fa-sign-out-alt w-3.5 text-center" />
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={openLogin}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-colors"
          style={{ background: "#00c896" }}
        >
          <i className="fas fa-sign-in-alt text-[11px]" />
          로그인
        </button>
      )}
    </div>
  );
}
