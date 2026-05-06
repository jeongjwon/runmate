"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/src/lib/api";
import { Marathon } from "@/src/types";
import { useUI } from "@/src/context/UIContext";

interface MarathonsResponse {
  data: Marathon[];
  participationMap: Record<number, { id: number; category: string }>;
}

const CITIES = [
  "전체",
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "경기도",
  "강원도",
  "충청북도",
  "충청남도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주도",
];
const CATS = ["전체", "5K", "10K", "Half", "Full"];

export default function MarathonsPage() {
  const qc = useQueryClient();
  const { showSnackbar, showConfirm, openLogin } = useUI();
  const { data: session } = useSession();
  const [city, setCity] = useState("전체");
  const [cat, setCat] = useState("전체");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<MarathonsResponse>({
    queryKey: ["marathons", city, cat],
    queryFn: () => {
      const p = new URLSearchParams();
      if (city !== "전체") p.set("city", city);
      if (cat !== "전체") p.set("category", cat);
      return api.get(`/marathons?${p}`);
    },
  });

  const participationMap = data?.participationMap ?? {};
  const marathons = (data?.data ?? []).filter(
    (m) => !search || m.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addMut = useMutation({
    mutationFn: (id: number) => api.post(`/participations/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marathons"] });
      qc.invalidateQueries({ queryKey: ["participations"] });
      showSnackbar("내 마라톤에 추가되었습니다");
    },
    onError: (e: Error) => showSnackbar(e.message, "error"),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/participations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marathons"] });
      qc.invalidateQueries({ queryKey: ["participations"] });
      showSnackbar("내 마라톤에서 제거되었습니다");
    },
    onError: (e: Error) => showSnackbar(e.message, "error"),
  });

  const toggle = (m: Marathon) => {
    if (!session) {
      showConfirm(
        "로그인이 필요합니다",
        "내 마라톤에 추가하려면 로그인해야 합니다.",
        () => openLogin(),
        { confirmLabel: "로그인하기", variant: "primary" },
      );
      return;
    }
    if (participationMap[m.id]) {
      showConfirm(
        "내 마라톤에서 제거",
        `${m.name}을(를) 제거하시겠습니까?`,
        () => delMut.mutate(m.id),
      );
    } else {
      addMut.mutate(m.id);
    }
  };

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-[var(--navy)]">마라톤 일정</h1>
        <p className="text-xs text-[var(--text3)] mt-0.5">
          국내 마라톤 일정을 확인하고 참가 신청하세요
        </p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input-dark w-auto text-sm"
        >
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="input-dark w-auto text-sm"
        >
          {CATS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] text-xs pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="대회명 검색"
            className="input-dark w-full pl-9 text-sm"
          />
        </div>
        {!isLoading && (
          <div className="flex items-center self-center ml-auto text-xs text-[var(--text3)]">
            {marathons.length}개 대회
          </div>
        )}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="text-center py-24 text-[var(--text3)]">
          <i className="fas fa-spinner fa-spin text-2xl" />
        </div>
      ) : marathons.length === 0 ? (
        <div className="text-center py-24">
          <i className="fas fa-calendar-times text-3xl mb-3 block text-[var(--border)]" />
          <p className="font-semibold text-sm text-[var(--text2)]">
            조건에 맞는 대회가 없습니다
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {marathons.map((m) => {
            const inMy = !!participationMap[m.id];
            const cats = m.categories
              ? m.categories
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean)
              : [];

            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-[var(--border)] flex flex-col hover:shadow-md transition-shadow"
              >
                <div className="px-4 pt-4 pb-3">
                  {/* 상단: 카테고리 + 상태 */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}
                    >
                      {m.isActive ? "모집중" : "마감"}
                    </span>
                  </div>

                  {/* 대회명 */}
                  <h3 className="font-bold text-sm text-[var(--navy)] leading-snug line-clamp-2 mb-2.5">
                    {m.name}
                  </h3>

                  {/* 상세 */}
                  <div className="space-y-1 text-xs text-[var(--text2)]">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-calendar-alt text-[var(--text3)] w-3.5 text-center" />
                      {m.date}
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="fas fa-map-marker-alt text-[var(--text3)] w-3.5 text-center" />
                      {m.location || m.city}
                    </div>
                    {m.entryFee > 0 && (
                      <div className="flex items-center gap-2">
                        <i className="fas fa-won-sign text-[var(--text3)] w-3.5 text-center" />
                        {m.entryFee.toLocaleString()}원
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {cats.slice(0, 3).map((c) => (
                        <span key={c} className="badge-gray">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="px-4 pb-4 flex gap-2 mt-auto">
                  {m.officialUrl && (
                    <a
                      href={m.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-outline flex-1 text-center text-xs py-1.5"
                    >
                      홈페이지
                    </a>
                  )}
                  <button
                    onClick={() => toggle(m)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      inMy
                        ? "bg-[var(--mint)] text-white"
                        : "border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                    }`}
                  >
                    {inMy ? (
                      <>
                        <i className="fas fa-check mr-1" />
                        추가됨
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus mr-1" />
                        추가
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
