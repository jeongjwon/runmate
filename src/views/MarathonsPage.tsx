"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  const { showSnackbar, showConfirm } = useUI();
  const { data: session } = useSession();
  const router = useRouter();
  const [city, setCity] = useState("전체");
  const [cat, setCat] = useState("전체");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<MarathonsResponse>({
    queryKey: ["marathons", city, cat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (city !== "전체") params.set("city", city);
      if (cat !== "전체") params.set("category", cat);
      return api.get(`/marathons?${params}`);
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
        () => router.push("/login"),
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
    <div>
      <h1 className="text-2xl font-extrabold mb-5 flex items-center gap-2 text-[var(--navy)]">
        <i className="fas fa-flag-checkered text-[var(--mint)]" />
        마라톤 일정
      </h1>

      {/* 검색 + 필터 */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input-dark w-auto"
        >
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="input-dark w-auto"
        >
          {CATS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[160px]">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] text-sm pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="대회명 검색"
            className="input-dark w-full pl-12"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-[var(--text3)]">
          <i className="fas fa-spinner fa-spin text-3xl" />
        </div>
      ) : marathons.length === 0 ? (
        <div className="text-center py-20 text-[var(--text2)]">
          <i className="fas fa-calendar-times text-4xl mb-3 block text-[var(--border)]" />
          <p className="font-bold">조건에 맞는 대회가 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {marathons.map((m) => {
            const inMy = !!participationMap[m.id];
            return (
              <div key={m.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-sm leading-snug text-[var(--navy)]">
                    {m.name}
                  </h3>
                  {m.isActive ? (
                    <span className="badge-mint shrink-0">모집중</span>
                  ) : (
                    <span className="badge-gray shrink-0">마감</span>
                  )}
                </div>
                <div className="space-y-1 text-xs mb-3 text-[var(--text2)]">
                  <div>
                    <i className="fas fa-calendar w-4" /> {m.date}
                  </div>
                  <div>
                    <i className="fas fa-map-marker-alt w-4" />{" "}
                    {m.location || m.city}
                  </div>
                  {m.entryFee > 0 && (
                    <div>
                      <i className="fas fa-won-sign w-4" />{" "}
                      {m.entryFee.toLocaleString()}원
                    </div>
                  )}
                  {m.categories && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.categories.split(",").map((c) => (
                        <span key={c} className="badge-gray">
                          {c.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {m.officialUrl && (
                    <a
                      href={m.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-outline px-3 py-1.5 text-xs font-bold flex-1 text-center"
                    >
                      홈페이지
                    </a>
                  )}
                  <button
                    onClick={() => toggle(m)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex-1 transition-colors ${
                      inMy
                        ? "bg-[var(--mint)] text-white border-none"
                        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)]"
                    }`}
                  >
                    {inMy ? (
                      <>
                        <i className="fas fa-star mr-1" />내 마라톤
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
