"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import dynamic from "next/dynamic";
import { api } from "@/src/lib/api";
import { Activity } from "@/src/types";
import {
  formatDuration,
  calcPace,
  getMonday,
  toDateStr,
  weatherEmoji,
  routeLabels,
} from "@/src/lib/utils";
import { useUI } from "@/src/context/UIContext";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const Polyline = dynamic(
  () => import("react-leaflet").then((m) => m.Polyline),
  { ssr: false },
);

function parseRouteData(routeData?: string): [number, number][] | null {
  if (!routeData) return null;
  try {
    const pts = JSON.parse(routeData);
    if (Array.isArray(pts) && pts.length > 0) return pts as [number, number][];
  } catch {}
  return null;
}

type Tab = "week" | "month" | "year" | "all";
type Period = {
  type: Tab;
  key: string;
  label: string;
  monday?: Date;
  sunday?: Date;
  ym?: string;
  year?: string;
};

function buildPeriods(tab: Tab, records: Activity[]): Period[] {
  const now = new Date();
  if (tab === "week") {
    const mon = getMonday(now);
    return Array.from({ length: 5 }, (_, i) => {
      const monday = new Date(mon);
      monday.setDate(monday.getDate() - i * 7);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const label =
        monday.getMonth() === sunday.getMonth()
          ? `${monday.getMonth() + 1}월 ${monday.getDate()}일 – ${sunday.getDate()}일`
          : `${monday.getMonth() + 1}월 ${monday.getDate()}일 – ${sunday.getMonth() + 1}월 ${sunday.getDate()}일`;
      return { type: "week", key: toDateStr(monday), label, monday, sunday };
    });
  }
  if (tab === "month") {
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const set = new Set([cur, ...records.map((r) => r.date.slice(0, 7))]);
    return Array.from(set)
      .sort()
      .reverse()
      .map((ym) => {
        const [y, m] = ym.split("-");
        return { type: "month", key: ym, label: `${y}년 ${parseInt(m)}월`, ym };
      });
  }
  if (tab === "year") {
    const cur = String(now.getFullYear());
    const set = new Set([cur, ...records.map((r) => r.date.slice(0, 4))]);
    return Array.from(set)
      .sort()
      .reverse()
      .map((yr) => ({ type: "year", key: yr, label: `${yr}년`, year: yr }));
  }
  return [{ type: "all", key: "all", label: "전체" }];
}

function filterByPeriod(records: Activity[], p: Period): Activity[] {
  if (p.type === "all") return records;
  if (p.type === "week")
    return records.filter(
      (r) => r.date >= toDateStr(p.monday!) && r.date <= toDateStr(p.sunday!),
    );
  if (p.type === "month")
    return records.filter((r) => r.date.startsWith(p.ym!));
  if (p.type === "year")
    return records.filter((r) => r.date.startsWith(p.year!));
  return records;
}

function buildChart(p: Period, records: Activity[]) {
  if (p.type === "week") {
    const labels = ["월", "화", "수", "목", "금", "토", "일"];
    const data = [0, 0, 0, 0, 0, 0, 0];
    const monT = p.monday!.getTime();
    records.forEach((r) => {
      const diff = Math.round(
        (new Date(r.date + "T00:00:00").getTime() - monT) / 86400000,
      );
      if (diff >= 0 && diff <= 6) data[diff] += r.distance;
    });
    return { labels, data };
  }
  if (p.type === "month") {
    const [y, mo] = p.ym!.split("-").map(Number);
    const days = new Date(y, mo, 0).getDate();
    const labels = Array.from({ length: days }, (_, i) => String(i + 1));
    const data = Array(days).fill(0);
    records.forEach((r) => {
      if (r.date.startsWith(p.ym!)) {
        const d = parseInt(r.date.slice(8, 10)) - 1;
        if (d >= 0 && d < days) data[d] += r.distance;
      }
    });
    return { labels, data };
  }
  if (p.type === "year") {
    const labels = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ].map((m) => m + "월");
    const data = Array(12).fill(0);
    records.forEach((r) => {
      if (r.date.startsWith(p.year!))
        data[parseInt(r.date.slice(5, 7)) - 1] += r.distance;
    });
    return { labels, data };
  }
  const ymap: Record<string, number> = {};
  records.forEach((r) => {
    const y = r.date.slice(0, 4);
    ymap[y] = (ymap[y] || 0) + r.distance;
  });
  const years = Object.keys(ymap).sort();
  return {
    labels: years.map((y) => y + "년"),
    data: years.map((y) => ymap[y]),
  };
}

function RecordForm({
  record,
  onClose,
  onSaved,
}: {
  record?: Activity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showSnackbar } = useUI();
  const [form, setForm] = useState({
    date: record?.date ?? new Date().toISOString().split("T")[0],
    distance: record?.distance ?? "",
    h: record ? Math.floor(record.duration / 3600) : 0,
    m: record ? Math.floor((record.duration % 3600) / 60) : 0,
    s: record ? record.duration % 60 : 0,
    heartRate: record?.heartRate ?? "",
    calories: record?.calories ?? "",
    routeType: record?.routeType ?? "road",
    weather: record?.weather ?? "",
    notes: record?.notes ?? "",
  });
  const set =
    (k: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const duration = `${form.h}:${String(form.m).padStart(2, "0")}:${String(form.s).padStart(2, "0")}`;
    if (!form.date || !form.distance || (!form.h && !form.m && !form.s))
      return showSnackbar("날짜, 거리, 시간은 필수입니다", "error");
    try {
      const body = {
        date: form.date,
        distance: Number(form.distance),
        duration,
        heart_rate: Number(form.heartRate) || 0,
        calories: Number(form.calories) || 0,
        route_type: form.routeType,
        weather: form.weather,
        notes: form.notes,
      };
      if (record) await api.put(`/records/${record.id}`, body);
      else await api.post("/records", body);
      onSaved();
      onClose();
      showSnackbar(record ? "기록이 수정되었습니다" : "기록이 저장되었습니다");
    } catch (e: any) {
      showSnackbar(e.message, "error");
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="px-5 py-4 flex justify-between items-center sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] rounded-t-2xl">
          <h2 className="text-base font-extrabold text-[var(--navy)]">
            {record ? "러닝 기록 수정" : "러닝 기록 추가"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface2)] text-[var(--text2)]"
          >
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                날짜 *
              </label>
              <input
                type="date"
                value={form.date}
                onChange={set("date")}
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                코스 유형
              </label>
              <select
                value={form.routeType}
                onChange={set("routeType")}
                className="input-dark w-full"
              >
                <option value="road">🛣️ 로드</option>
                <option value="trail">🌲 트레일</option>
                <option value="track">🏟️ 트랙</option>
                <option value="treadmill">🏃 러닝머신</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                거리 (km) *
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="5.00"
                value={form.distance}
                onChange={set("distance")}
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                시간 *
              </label>
              <div className="flex gap-1 items-center">
                <input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="0"
                  value={form.h}
                  onChange={set("h")}
                  className="input-dark text-center px-1 w-full"
                />
                <span className="text-[var(--text3)] font-bold shrink-0">
                  :
                </span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="00"
                  value={form.m}
                  onChange={set("m")}
                  className="input-dark text-center px-1 w-full"
                />
                <span className="text-[var(--text3)] font-bold shrink-0">
                  :
                </span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="00"
                  value={form.s}
                  onChange={set("s")}
                  className="input-dark text-center px-1 w-full"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                심박수 (bpm)
              </label>
              <input
                type="number"
                placeholder="150"
                value={form.heartRate}
                onChange={set("heartRate")}
                className="input-dark w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                날씨
              </label>
              <select
                value={form.weather}
                onChange={set("weather")}
                className="input-dark w-full"
              >
                <option value="">선택</option>
                <option value="sunny">☀️ 맑음</option>
                <option value="cloudy">☁️ 흐림</option>
                <option value="rainy">🌧️ 비</option>
                <option value="snowy">❄️ 눈</option>
                <option value="windy">💨 바람</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
              메모
            </label>
            <textarea
              rows={2}
              placeholder="오늘 러닝 어땠나요?"
              value={form.notes}
              onChange={set("notes")}
              className="input-dark w-full resize-none"
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="btn-outline flex-1 py-2.5 text-sm font-bold"
          >
            취소
          </button>
          <button
            onClick={save}
            className="btn-mint flex-1 justify-center py-2.5 text-sm"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const qc = useQueryClient();
  const { showSnackbar, showConfirm } = useUI();
  const [tab, setTab] = useState<Tab>("month");
  const [pidx, setPidx] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editRec, setEditRec] = useState<Activity | null>(null);
  const [expandedMap, setExpandedMap] = useState<number | null>(null);
  const tcxRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery<{ data: Activity[] }>({
    queryKey: ["records"],
    queryFn: () => api.get("/records"),
  });
  const allRecords = data?.data ?? [];

  const periods = useMemo(
    () => buildPeriods(tab, allRecords),
    [tab, allRecords],
  );
  useEffect(() => {
    setPidx(0);
  }, [tab]);

  const period = periods[pidx] ?? periods[0];
  const filtered = useMemo(
    () => filterByPeriod(allRecords, period),
    [allRecords, period],
  );
  const stats = useMemo(() => {
    const dist = filtered.reduce((s, r) => s + r.distance, 0);
    const sec = filtered.reduce((s, r) => s + r.duration, 0);
    return {
      dist,
      time: formatDuration(sec),
      pace: calcPace(dist, sec),
      count: filtered.length,
    };
  }, [filtered]);
  const chartData = useMemo(
    () => buildChart(period, allRecords),
    [period, allRecords],
  );

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/records/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      showSnackbar("기록이 삭제되었습니다");
    },
    onError: (e: Error) => showSnackbar(e.message, "error"),
  });

  const reload = () => qc.invalidateQueries({ queryKey: ["records"] });

  const handleTCX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("tcx", file);
    fd.append("route_type", "road");
    api
      .upload("/records/import/tcx", fd)
      .then(() => {
        reload();
        showSnackbar("TCX 기록이 추가되었습니다");
      })
      .catch((err: any) =>
        showSnackbar(err.message || "TCX 업로드 실패", "error"),
      );
    e.target.value = "";
  };

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("csv", file);
    api
      .upload("/records/import/csv", fd)
      .then((res: any) => {
        reload();
        showSnackbar(res.message || "CSV 기록이 추가되었습니다");
      })
      .catch((err: any) =>
        showSnackbar(err.message || "CSV 업로드 실패", "error"),
      );
    e.target.value = "";
  };

  const maxDist = Math.max(0, ...chartData.data);
  const barColors = chartData.data.map((v) =>
    v === maxDist && v > 0 ? "#00c896" : "rgba(0,200,150,0.15)",
  );

  const DOW = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="space-y-4">
      {/* ── 통계 카드 ── */}
      <div className="card p-5">
        {/* 탭 */}
        <div className="flex justify-center mb-5">
          <div className="flex gap-0.5 p-1 rounded-xl bg-[var(--surface2)]">
            {(["week", "month", "year", "all"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`act-tab ${tab === t ? "active" : ""}`}
              >
                {{ week: "주간", month: "월간", year: "연간", all: "전체" }[t]}
              </button>
            ))}
          </div>
        </div>

        {/* 기간 네비게이터 */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setPidx((i) => Math.min(i + 1, periods.length - 1))}
            disabled={pidx >= periods.length - 1 || tab === "all"}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] text-[var(--text3)] disabled:opacity-20 transition-colors"
          >
            <i className="fas fa-chevron-left text-[10px]" />
          </button>
          <span className="text-sm font-bold text-[var(--navy)]">
            {period?.label}
          </span>
          <button
            onClick={() => setPidx((i) => Math.max(i - 1, 0))}
            disabled={pidx <= 0 || tab === "all"}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] text-[var(--text3)] disabled:opacity-20 transition-colors"
          >
            <i className="fas fa-chevron-right text-[10px]" />
          </button>
        </div>

        {/* 통계 + 차트 */}
        <div className="flex flex-col sm:flex-row gap-6 sm:items-stretch">
          {/* 통계 */}
          <div className="sm:w-40 shrink-0">
            {/* 주 수치 */}
            <div className="mb-5">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span
                  className="font-black text-[var(--navy)] tracking-tight"
                  style={{ fontSize: "clamp(2.2rem,7vw,3rem)", lineHeight: 1 }}
                >
                  {stats.dist > 0 ? stats.dist.toFixed(1) : "0"}
                </span>
                <span className="text-sm font-medium text-[var(--text3)]">
                  km
                </span>
              </div>
              <p className="text-[0.6rem] font-semibold text-[var(--text3)] uppercase tracking-widest mt-1.5">
                총 거리
              </p>
            </div>

            {/* 보조 지표 — 구분선만, 박스 없음 */}
            <div className="space-y-0 divide-y divide-[var(--border)]">
              {[
                { val: stats.count, unit: "회", label: "러닝" },
                { val: stats.pace, unit: "/km", label: "평균 페이스" },
                {
                  val: stats.count > 0 ? stats.time : "–",
                  unit: "",
                  label: "총 시간",
                },
              ].map(({ val, unit, label }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-[0.65rem] text-[var(--text3)]">
                    {label}
                  </span>
                  <span className="text-sm font-bold text-[var(--navy)]">
                    {val}
                    {unit && (
                      <span className="text-[0.65rem] font-normal text-[var(--text3)] ml-0.5">
                        {unit}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 차트 */}
          <div className="flex-1 relative" style={{ minHeight: 160 }}>
            <Bar
                data={{
                  labels: chartData.labels,
                  datasets: [
                    {
                      data: chartData.data,
                      backgroundColor: barColors,
                      borderRadius: 4,
                      borderSkipped: "bottom",
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: "rgba(27,45,64,.95)",
                      titleColor: "#9aaab8",
                      bodyColor: "#fff",
                      padding: 10,
                      cornerRadius: 8,
                      displayColors: false,
                      callbacks: {
                        label: (ctx) => `${(ctx.raw as number).toFixed(1)} km`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      border: { display: false },
                      ticks: {
                        color: "#9aaab8",
                        font: { size: 10 },
                        maxTicksLimit: 12,
                      },
                    },
                    y: {
                      beginAtZero: true,
                      grid: { color: "rgba(0,0,0,0.04)" },
                      border: { display: false },
                      ticks: { display: false },
                    },
                  },
                }}
                style={{ position: "absolute", inset: 0 }}
              />
          </div>
        </div>
      </div>

      {/* ── 활동 목록 ── */}
      <div>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider">
              활동
            </h2>
            {allRecords.length > 0 && (
              <span className="text-[0.65rem] text-[var(--text3)]">
                {allRecords.length}개
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <input
              ref={csvRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCSV}
            />
            <input
              ref={tcxRef}
              type="file"
              accept=".tcx"
              className="hidden"
              onChange={handleTCX}
            />
            <button
              onClick={() => csvRef.current?.click()}
              className="btn-outline px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5"
            >
              <i className="fas fa-file-csv text-[var(--text3)]" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => tcxRef.current?.click()}
              className="btn-outline px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5"
            >
              <i className="fas fa-route text-[var(--text3)]" />
              <span className="hidden sm:inline">TCX</span>
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="btn-mint px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <i className="fas fa-plus" />
              <span className="hidden sm:inline">추가</span>
            </button>
          </div>
        </div>

        {allRecords.length === 0 ? (
          <div className="card text-center py-16">
            <i className="fas fa-person-running text-4xl text-[var(--border)] block mb-3" />
            <p className="font-bold text-[var(--text2)]">
              아직 기록이 없습니다
            </p>
            <p className="text-xs text-[var(--text3)] mt-1">
              첫 러닝 기록을 추가해보세요
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {allRecords.map((r) => {
              const dow = DOW[new Date(r.date + "T00:00:00").getDay()];
              const mon = parseInt(r.date.slice(5, 7));
              const day = parseInt(r.date.slice(8, 10));
              const routePts = parseRouteData(r.routeData);
              const mapOpen = expandedMap === r.id;

              return (
                <div
                  key={r.id}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden"
                >
                  <div className="px-5 py-4">
                    {/* 날짜 + 액션 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-[var(--text3)]">
                        {mon}월 {day}일&nbsp;
                        <span className="font-semibold">{dow}</span>
                      </span>
                      <div className="flex gap-1">
                        {routePts && (
                          <button
                            onClick={() =>
                              setExpandedMap(mapOpen ? null : r.id)
                            }
                            className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] transition-colors ${
                              mapOpen
                                ? "text-[var(--mint)]"
                                : "text-[var(--text3)] hover:text-[var(--navy)]"
                            }`}
                          >
                            <i className="fas fa-map" />
                          </button>
                        )}
                        <button
                          onClick={() => setEditRec(r)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-[10px] text-[var(--text3)] hover:text-[var(--navy)] transition-colors"
                        >
                          <i className="fas fa-pen" />
                        </button>
                        <button
                          onClick={() =>
                            showConfirm(
                              "기록 삭제",
                              "이 러닝 기록을 삭제하시겠습니까?",
                              () => deleteMut.mutate(r.id),
                            )
                          }
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-[10px] text-[var(--text3)] hover:text-red-400 transition-colors"
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </div>

                    {/* 거리 — 히어로 수치 */}
                    <div className="flex items-baseline gap-1.5 mb-2.5">
                      <span
                        className="font-black text-[var(--navy)] tracking-tight leading-none"
                        style={{ fontSize: "1.875rem" }}
                      >
                        {r.distance.toFixed(2)}
                      </span>
                      <span className="text-sm font-medium text-[var(--text3)]">
                        km
                      </span>
                    </div>

                    {/* 핵심 지표 */}
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--text2)]">
                      <span className="font-medium">
                        {r.duration_formatted}
                      </span>
                      <span className="text-[var(--border)]">·</span>
                      <span className="font-bold text-[var(--mint)]">
                        {r.pace}
                        <span className="font-normal text-[var(--text3)]">
                          /km
                        </span>
                      </span>
                      {r.heartRate > 0 && (
                        <>
                          <span className="text-[var(--border)]">·</span>
                          <span>{r.heartRate} bpm</span>
                        </>
                      )}
                    </div>

                    {/* 메타 태그 */}
                    {(r.routeType || r.weather || r.notes) && (
                      <div className="flex items-center gap-2 mt-2.5 text-[0.65rem] text-[var(--text3)]">
                        {r.routeType && (
                          <span>{routeLabels[r.routeType] || r.routeType}</span>
                        )}
                        {r.routeType && (r.weather || r.notes) && (
                          <span>·</span>
                        )}
                        {r.weather && <span>{weatherEmoji[r.weather]}</span>}
                        {r.weather && r.notes && <span>·</span>}
                        {r.notes && (
                          <span className="italic truncate max-w-[200px] text-[var(--text2)]">
                            {r.notes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 루트 지도 */}
                  {mapOpen && routePts && (
                    <div
                      style={{ height: 200 }}
                      className="border-t border-[var(--border)]"
                    >
                      <MapContainer
                        center={routePts[0]}
                        zoom={14}
                        style={{ width: "100%", height: "100%" }}
                        scrollWheelZoom={false}
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution="&copy; OpenStreetMap"
                        />
                        <Polyline
                          positions={routePts}
                          color="#00c896"
                          weight={3}
                          opacity={0.85}
                        />
                      </MapContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(addOpen || editRec) && (
        <RecordForm
          record={editRec ?? undefined}
          onClose={() => {
            setAddOpen(false);
            setEditRec(null);
          }}
          onSaved={reload}
        />
      )}
    </div>
  );
}
