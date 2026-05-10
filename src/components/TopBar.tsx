"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { api } from "@/src/lib/api";
import { User } from "@/src/types";
import { useUI } from "@/src/context/UIContext";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

const NOTIF_ICON: Record<string, string> = {
  dday_1: "fa-flag-checkered",
  dday_7: "fa-calendar-alt",
  badge: "fa-medal",
};
const NOTIF_COLOR: Record<string, string> = {
  dday_1: "#ef4444",
  dday_7: "#f97316",
  badge: "#00c896",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function TopBar() {
  const { openLogin, showConfirm } = useUI();
  const qc = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: meData } = useQuery<{ user: User | null }>({
    queryKey: ["me"],
    queryFn: () => api.get("/me"),
    staleTime: Infinity,
  });
  const user = meData?.user;

  const { data: notifData } = useQuery<{ data: Notification[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications"),
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });
  const notifications = notifData?.data ?? [];
  const unreadCount = notifData?.unreadCount ?? 0;

  const { data: monthData } = useQuery<{ distance: number }>({
    queryKey: ["this-month-km"],
    queryFn: () => api.get("/stats/this-month"),
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });
  const thisMonthKm = monthData?.distance ?? 0;

  const markReadMut = useMutation({
    mutationFn: (ids?: number[]) =>
      api.patch("/notifications", ids ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteAccountMut = useMutation({
    mutationFn: () => fetch("/api/me", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => signOut({ callbackUrl: "/" }),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openNotif = () => {
    setNotifOpen((o) => !o);
    setProfileOpen(false);
    if (!notifOpen && unreadCount > 0) markReadMut.mutate(undefined);
  };

  const openProfile = () => {
    setProfileOpen((o) => !o);
    setNotifOpen(false);
  };

  const handleDeleteAccount = () => {
    setProfileOpen(false);
    showConfirm(
      "회원 탈퇴",
      "탈퇴하면 모든 러닝 기록, 참가 이력, 배지가 즉시 삭제되며 복구할 수 없습니다. 정말 탈퇴하시겠습니까?",
      () => deleteAccountMut.mutate(),
      { confirmLabel: "탈퇴하기", variant: "danger" },
    );
  };

  return (
    <div className="flex items-center justify-end gap-1.5 h-11 mb-3">
      {user && (
        <>
          {/* 알림 벨 */}
          <div ref={notifRef} className="relative">
            <button
              onClick={openNotif}
              className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] transition-colors text-[var(--text2)]"
              title="알림"
            >
              <i className="fas fa-bell text-sm" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white bg-red-500">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-[var(--border)] rounded-2xl shadow-lg overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                  <p className="text-xs font-bold text-[var(--navy)]">알림</p>
                  {notifications.some((n) => !n.isRead) && (
                    <button
                      onClick={() => markReadMut.mutate(undefined)}
                      className="text-[10px] text-[var(--mint)] font-semibold hover:underline"
                    >
                      모두 읽음
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-[var(--text3)] text-center py-8">
                      알림이 없습니다
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 ${!n.isRead ? "bg-blue-50/40" : ""}`}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: `${NOTIF_COLOR[n.type]}18` }}
                        >
                          <i
                            className={`fas ${NOTIF_ICON[n.type] ?? "fa-bell"} text-[11px]`}
                            style={{ color: NOTIF_COLOR[n.type] ?? "#00c896" }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-semibold text-[var(--navy)] leading-snug">
                              {n.title}
                            </p>
                            {!n.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1" />
                            )}
                          </div>
                          {n.body && (
                            <p className="text-[10px] text-[var(--text3)] mt-0.5 truncate">{n.body}</p>
                          )}
                          <p className="text-[10px] text-[var(--text3)] mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 프로필 */}
          <div ref={profileRef} className="relative">
            <button
              onClick={openProfile}
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
                className={`fas fa-chevron-down text-[9px] text-[var(--text3)] transition-transform ${profileOpen ? "rotate-180" : ""}`}
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[var(--border)] rounded-2xl shadow-lg overflow-hidden z-50">
                {/* 프로필 헤더 */}
                <div className="flex items-center gap-3 px-4 py-3.5">
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

                {/* 이번 달 km */}
                <div className="mx-3 mb-3 px-3 py-2.5 rounded-xl bg-[var(--surface2)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-person-running text-[var(--mint)] text-xs" />
                    <span className="text-[11px] text-[var(--text2)]">이번 달</span>
                  </div>
                  <span className="text-xs font-bold text-[var(--navy)]">
                    {thisMonthKm.toFixed(1)} km
                  </span>
                </div>

                <div className="border-t border-[var(--border)] mx-3" />

                {/* 메뉴 */}
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors font-semibold"
                  >
                    <i className="fas fa-sign-out-alt w-3.5 text-center text-[var(--text3)]" />
                    로그아웃
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-50 transition-colors font-semibold"
                  >
                    <i className="fas fa-user-times w-3.5 text-center" />
                    회원 탈퇴
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!user && (
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
