"use client";

import { useState, useEffect, useMemo } from "react";
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
const MONTHS = ["전체", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const PAGE_SIZE = 12;

export default function MarathonsPage() {
  const qc = useQueryClient();
  const { showSnackbar, showConfirm, openLogin } = useUI();
  const { data: session } = useSession();
  const [city, setCity] = useState("전체");
  const [cat, setCat] = useState("전체");
  const [month, setMonth] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

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
  const filtered = useMemo(() => {
    const list = (data?.data ?? []).filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (month > 0) {
        const mMonth = parseInt(m.date.split("-")[1], 10);
        if (mMonth !== month) return false;
      }
      return true;
    });

    // 다가오는 대회 먼저(가까운 순), 지난 대회는 뒤에(최근 순)
    list.sort((a, b) => {
      const aFuture = a.date >= today;
      const bFuture = b.date >= today;
      if (aFuture && bFuture) return a.date < b.date ? -1 : 1;
      if (!aFuture && !bFuture) return b.date < a.date ? -1 : 1;
      return aFuture ? -1 : 1;
    });

    return list;
  }, [data, search, month, today]);

  const upcomingCount = useMemo(
    () => (data?.data ?? []).filter((m) => m.date >= today).length,
    [data, today],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const marathons = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [city, cat, search, month]);

  const addMut = useMutation({
    mutationFn: (id: number) => api.post(`/participations/${id}`, {}),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["marathons", city, cat] });
      const previous = qc.getQueryData<MarathonsResponse>(["marathons", city, cat]);
      qc.setQueryData<MarathonsResponse>(["marathons", city, cat], (old) =>
        old ? { ...old, participationMap: { ...old.participationMap, [id]: { id: -1, category: "" } } } : old,
      );
      return { previous };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(["marathons", city, cat], ctx.previous);
      showSnackbar(e.message, "error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marathons"] });
      qc.invalidateQueries({ queryKey: ["participations"] });
      showSnackbar("내 마라톤에 추가되었습니다");
    },
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/participations/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["marathons", city, cat] });
      const previous = qc.getQueryData<MarathonsResponse>(["marathons", city, cat]);
      qc.setQueryData<MarathonsResponse>(["marathons", city, cat], (old) => {
        if (!old) return old;
        const map = { ...old.participationMap };
        delete map[id];
        return { ...old, participationMap: map };
      });
      return { previous };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(["marathons", city, cat], ctx.previous);
      showSnackbar(e.message, "error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marathons"] });
      qc.invalidateQueries({ queryKey: ["participations"] });
      showSnackbar("내 마라톤에서 제거되었습니다");
    },
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
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-[var(--navy)]">마라톤 일정</h1>
        <p className="text-xs text-[var(--text3)] mt-0.5">
          국내 마라톤 일정을 확인하고 참가 신청하세요
        </p>
      </div>

      {/* 카운트 배너 */}
      <div className="bg-white rounded-2xl border border-[var(--border)] px-5 py-4 flex items-center gap-3">
        {isLoading ? (
          <div className="h-8 w-40 bg-[var(--surface2)] rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-[var(--mint)] tabular-nums">
                {search || month > 0 ? filtered.length : (data?.data.length ?? 0)}
              </span>
              <span className="text-sm font-medium text-[var(--text2)]">
                {search || month > 0 ? "개 검색됨" : "개 대회"}
              </span>
              {(search || month > 0) && (
                <span className="text-xs text-[var(--text3)] ml-0.5">
                  / 전체 {data?.data.length ?? 0}개
                </span>
              )}
            </div>
            <div className="h-7 w-px bg-[var(--border)] mx-1" />
            <div className="flex items-center gap-1.5 text-xs text-[var(--text3)]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              다가오는 대회
              <span className="font-semibold text-[var(--text2)] ml-0.5">{upcomingCount}개</span>
            </div>
          </>
        )}
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-2xl border border-[var(--border)] p-3">
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
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="input-dark w-auto text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
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
        </div>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="text-center py-24 text-[var(--text3)]">
          <i className="fas fa-spinner fa-spin text-2xl" />
        </div>
      ) : filtered.length === 0 ? (
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
            const isPast = m.date < today;
            const statusLabel = isPast ? "대회 마감" : "대회 전";
            const statusClass = isPast
              ? "bg-gray-100 text-gray-400"
              : "bg-emerald-50 text-emerald-600";

            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-[var(--border)] flex flex-col hover:shadow-md transition-shadow"
              >
                <div className="px-4 pt-4 pb-3">
                  {/* 상단: 상태 + 하트 */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>
                      {statusLabel}
                    </span>
                    <button
                      onClick={() => toggle(m)}
                      className="group w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] transition-all duration-200 active:scale-90"
                      aria-label={inMy ? "내 마라톤에서 제거" : "내 마라톤에 추가"}
                    >
                      <i
                        className={`${inMy ? "fas" : "far"} fa-heart text-base transition-all duration-200 ${
                          inMy ? "scale-110" : "text-[var(--text3)] group-hover:text-[#FFE100]"
                        }`}
                        style={inMy ? { color: "#FFE100", filter: "drop-shadow(0 0 6px rgba(255,225,0,0.65))" } : {}}
                      />
                    </button>
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

                {/* 홈페이지 버튼 */}
                {m.officialUrl && (
                  <div className="px-4 pb-4 mt-auto">
                    <a
                      href={m.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-outline w-full text-center text-xs py-1.5 block"
                    >
                      홈페이지
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {!isLoading && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const delta = 2;
  const pages: (number | "…")[] = [];

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  const btn =
    "min-w-[32px] h-8 px-2 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors";

  return (
    <div className="flex items-center justify-center gap-1 pt-2">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className={`${btn} border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <i className="fas fa-chevron-left text-[10px]" />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="text-xs text-[var(--text3)] px-1">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`${btn} ${
              p === page
                ? "bg-[var(--navy)] text-white"
                : "border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className={`${btn} border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <i className="fas fa-chevron-right text-[10px]" />
      </button>
    </div>
  );
}
