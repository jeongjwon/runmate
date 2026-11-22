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
import { Activity, Participation, Shoe, TrainingPlan } from "@/src/types";
import {
  formatDuration,
  calcPace,
  getMonday,
  toDateStr,
  weatherEmoji,
  routeLabels,
  runTypeLabels,
  addDays,
} from "@/src/lib/utils";
import { useUI } from "@/src/context/UIContext";
import ActivityCalendar from "@/src/components/ActivityCalendar";
import RunTypePicker from "@/src/components/RunTypePicker";
import TcxImportModal, { TcxResult } from "@/src/components/TcxImportModal";
import WeekPlanCard from "@/src/components/WeekPlanCard";
import PlanEditModal from "@/src/components/PlanEditModal";
import ShoesCard from "@/src/components/ShoesCard";

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

type View = "list" | "calendar";
const VIEW_KEY = "activity-view";

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
  defaultDate,
  shoes,
  onClose,
  onSaved,
}: {
  record?: Activity;
  defaultDate?: string;
  shoes: Shoe[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showSnackbar } = useUI();
  const [form, setForm] = useState({
    date: record?.date ?? defaultDate ?? toDateStr(new Date()),
    distance: record?.distance ?? "",
    h: record ? Math.floor(record.duration / 3600) : 0,
    m: record ? Math.floor((record.duration % 3600) / 60) : 0,
    s: record ? record.duration % 60 : 0,
    heartRate: record?.heartRate ?? "",
    maxHeartRate: record?.maxHeartRate || "",
    calories: record?.calories ?? "",
    routeType: record?.routeType ?? "road",
    runType: record?.runType ?? "",
    shoeId: record?.shoeId ? String(record.shoeId) : "",
    weather: record?.weather ?? "",
    notes: record?.notes ?? "",
  });
  // 은퇴한 신발은 숨기되, 이 기록에 이미 지정된 신발이면 선택지에 남겨 둠
  const shoeOptions = shoes.filter(
    (s) => !s.retired || String(s.id) === form.shoeId,
  );
  const livePace = calcPace(
    Number(form.distance),
    Number(form.h) * 3600 + Number(form.m) * 60 + Number(form.s),
  );
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
        max_heart_rate: Number(form.maxHeartRate) || 0,
        calories: Number(form.calories) || 0,
        route_type: form.routeType,
        run_type: form.runType,
        shoe_id: form.shoeId ? Number(form.shoeId) : null,
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
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
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
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
              훈련 종류
            </label>
            <RunTypePicker
              value={form.runType}
              onChange={(v) => setForm((f) => ({ ...f, runType: v }))}
            />
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
          {livePace !== "—" && (
            <p className="!mt-2 px-3 py-2 rounded-lg bg-[var(--surface2)] text-xs text-[var(--text2)]">
              페이스{" "}
              <b className="text-sm text-[var(--navy)]">{livePace}</b> /km
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                평균 심박 (bpm)
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
                최고 심박 (bpm)
              </label>
              <input
                type="number"
                placeholder="170"
                value={form.maxHeartRate}
                onChange={set("maxHeartRate")}
                className="input-dark w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">
                신발
              </label>
              <select
                value={form.shoeId}
                onChange={set("shoeId")}
                className="input-dark w-full"
              >
                <option value="">선택 안 함</option>
                {shoeOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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

const WEATHER_LABEL: Record<string, string> = {
  sunny: "맑음",
  cloudy: "흐림",
  rainy: "비",
  snowy: "눈",
  windy: "바람",
};

function ActivityDrawer({
  record,
  shoeName,
  onClose,
  onEdit,
  onDelete,
}: {
  record: Activity;
  shoeName?: string;
  onClose: () => void;
  onEdit: (r: Activity) => void;
  onDelete: (r: Activity) => void;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const routePts = parseRouteData(record.routeData);
  const d = new Date(record.date + "T00:00:00");
  const dateStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];

  const stats = [
    { label: "거리", value: record.distance.toFixed(2), unit: "km" },
    { label: "페이스", value: record.pace, unit: "/km" },
    { label: "시간", value: record.duration_formatted, unit: "" },
  ];
  const extras = [
    record.maxHeartRate
      ? {
          icon: "fa-heart",
          label: "심박 (평균/최고)",
          value: `${record.heartRate || "—"} / ${record.maxHeartRate} bpm`,
        }
      : record.heartRate
        ? {
            icon: "fa-heart",
            label: "심박수",
            value: `${record.heartRate} bpm`,
          }
        : null,
    record.calories
      ? { icon: "fa-fire", label: "칼로리", value: `${record.calories} kcal` }
      : null,
    record.weather
      ? {
          icon: "fa-cloud",
          label: "날씨",
          value: `${weatherEmoji[record.weather] ?? ""} ${WEATHER_LABEL[record.weather] ?? record.weather}`,
        }
      : null,
  ].filter(Boolean) as { icon: string; label: string; value: string }[];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop fixed inset-0 z-[50] bg-black/25 ${show ? "drawer-show" : ""}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`drawer-panel fixed z-[55] bg-white flex flex-col
          bottom-0 left-0 right-0 max-h-[88vh]
          sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[360px]  sm:max-h-full
          ${show ? "drawer-show" : ""}`}
        style={{ boxShadow: "-4px 0 32px rgba(0,0,0,0.10)" }}
      >
        {/* Handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-8 h-1 rounded-full bg-[var(--border)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-[var(--text3)] mb-0.5">
                {dateStr} ({dow})
              </p>
              <h2 className="text-base font-extrabold text-[var(--navy)]">
                러닝 기록
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {runTypeLabels[record.runType] && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(0,200,150,0.14)] text-[#00694f]">
                    {runTypeLabels[record.runType]}
                  </span>
                )}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[var(--text2)]">
                  {routeLabels[record.routeType] || "로드"}
                </span>
                {record.weather && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[var(--text2)]">
                    {weatherEmoji[record.weather] ?? ""}{" "}
                    {WEATHER_LABEL[record.weather]}
                  </span>
                )}
                {shoeName && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface2)] text-[var(--text2)]">
                    <i className="fas fa-shoe-prints mr-1 text-[9px]" />
                    {shoeName}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Main stats — 3 columns */}
          <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
            {stats.map(({ label, value, unit }) => (
              <div key={label} className="py-5 text-center">
                <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-1.5">
                  {label}
                </p>
                <p className="text-xl font-black text-[var(--navy)] leading-none">
                  {value}
                </p>
                {unit && (
                  <p className="text-[10px] text-[var(--text3)] mt-1">{unit}</p>
                )}
              </div>
            ))}
          </div>

          {/* Extra info */}
          {extras.length > 0 && (
            <div className="px-5 py-4 border-b border-[var(--border)] grid grid-cols-3 gap-3">
              {extras.map(({ icon, label, value }) => (
                <div key={label} className="text-center">
                  <i
                    className={`fas ${icon} text-[var(--text3)] text-xs mb-1 block`}
                  />
                  <p className="text-[9px] text-[var(--text3)] mb-0.5">
                    {label}
                  </p>
                  <p className="text-xs font-semibold text-[var(--navy)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Route map */}
          {routePts && (
            <div
              className="border-b border-[var(--border)]"
              style={{ height: 220 }}
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
                  opacity={0.9}
                />
              </MapContainer>
            </div>
          )}

          {/* Notes */}
          {record.notes && (
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-1.5">
                메모
              </p>
              <p className="text-sm text-[var(--text)] leading-relaxed">
                {record.notes}
              </p>
            </div>
          )}

          <div className="h-4" />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex gap-2 shrink-0">
          <button
            onClick={() => {
              onEdit(record);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors text-[var(--navy)]"
          >
            <i className="fas fa-pen text-xs" /> 수정
          </button>
          <button
            onClick={() => onDelete(record)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border border-[var(--border)] hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors text-[var(--text2)]"
          >
            <i className="fas fa-trash text-xs" /> 삭제
          </button>
        </div>
      </div>
    </>
  );
}

export default function ActivityPage() {
  const qc = useQueryClient();
  const { showSnackbar, showConfirm } = useUI();
  const [view, setView] = useState<View>("calendar");
  const [tab, setTab] = useState<Tab>("month");
  const [pidx, setPidx] = useState(0);
  const [cal, setCal] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  });
  const [selDate, setSelDate] = useState(() => toDateStr(new Date()));
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>();
  const [editRec, setEditRec] = useState<Activity | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null,
  );
  const [tcxProgress, setTcxProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [tcxResults, setTcxResults] = useState<TcxResult[] | null>(null);
  const [planEditOpen, setPlanEditOpen] = useState(false);
  const tcxRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  // 마지막으로 본 보기(목록/캘린더)를 기억
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const { data, isPending: recordsPending } = useQuery<{ data: Activity[] }>({
    queryKey: ["records"],
    queryFn: () => api.get("/records"),
  });
  const allRecords = data?.data ?? [];

  // 캘린더에 참가 대회 날짜를 표시하기 위한 조회
  const { data: partData } = useQuery<{ data: Participation[] }>({
    queryKey: ["participations"],
    queryFn: () => api.get("/participations"),
    retry: false,
  });
  const races = partData?.data ?? [];

  const { data: shoeData } = useQuery<{ data: Shoe[] }>({
    queryKey: ["shoes"],
    queryFn: () => api.get("/shoes"),
  });
  const shoes = shoeData?.data ?? [];

  const calYm = `${cal.y}-${String(cal.m).padStart(2, "0")}`;
  const moveMonth = (delta: number) => {
    const d = new Date(cal.y, cal.m - 1 + delta, 1);
    const today = new Date();
    const isThisMonth =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth();
    setCal({ y: d.getFullYear(), m: d.getMonth() + 1 });
    setSelDate(toDateStr(isThisMonth ? today : d));
  };
  const goToday = () => {
    const today = new Date();
    setCal({ y: today.getFullYear(), m: today.getMonth() + 1 });
    setSelDate(toDateStr(today));
  };

  const periods = useMemo(
    () => buildPeriods(tab, allRecords),
    [tab, allRecords],
  );
  useEffect(() => {
    setPidx(0);
  }, [tab]);

  const period = periods[pidx] ?? periods[0];
  // 캘린더 보기에서는 보고 있는 달, 목록 보기에서는 선택한 기간 기준으로 집계
  const filtered = useMemo(
    () =>
      view === "calendar"
        ? allRecords.filter((r) => r.date.startsWith(calYm))
        : filterByPeriod(allRecords, period),
    [allRecords, period, view, calYm],
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

  // 훈련 계획: 보고 있는 달에 걸친 주(월–일)를 모두 포함하도록 조회.
  // Claude 에서 바꾼 계획이 바로 보이도록 화면에 돌아올 때마다 새로 불러옴
  const planFrom = toDateStr(getMonday(new Date(cal.y, cal.m - 1, 1)));
  const planTo = addDays(toDateStr(getMonday(new Date(cal.y, cal.m, 0))), 6);
  const plansKey = ["plans", planFrom, planTo];
  const { data: planData, isPending: plansPending } = useQuery<{
    data: TrainingPlan[];
  }>({
    queryKey: plansKey,
    queryFn: () => api.get(`/plans?from=${planFrom}&to=${planTo}`),
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
  const plans = planData?.data ?? [];
  const weekStart = toDateStr(getMonday(new Date(selDate + "T00:00:00")));
  const weekPlans = plans.filter(
    (p) => p.date >= weekStart && p.date <= addDays(weekStart, 6),
  );
  const invalidatePlans = () => qc.invalidateQueries({ queryKey: ["plans"] });

  const togglePlanMut = useMutation({
    mutationFn: ({ plan, done }: { plan: TrainingPlan; done: boolean }) =>
      api.put(`/plans/${plan.date}`, { done }),
    // 체크는 바로 반영하고, 실패하면 되돌림
    onMutate: async ({ plan, done }) => {
      await qc.cancelQueries({ queryKey: plansKey });
      const prev = qc.getQueryData<{ data: TrainingPlan[] }>(plansKey);
      qc.setQueryData<{ data: TrainingPlan[] }>(plansKey, (old) =>
        old
          ? {
              data: old.data.map((p) =>
                p.date === plan.date ? { ...p, done } : p,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(plansKey, ctx.prev);
      showSnackbar(e.message, "error");
    },
    onSettled: invalidatePlans,
  });

  const invalidateRecords = () => {
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["this-month-km"] });
    qc.invalidateQueries({ queryKey: ["shoes"] });
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/records/${id}`),
    onSuccess: () => {
      invalidateRecords();
      showSnackbar("기록이 삭제되었습니다");
      setSelectedActivity(null);
    },
    onError: (e: Error) => showSnackbar(e.message, "error"),
  });

  const reload = invalidateRecords;

  const handleTCX = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    // 파일마다 따로 요청: 하나가 실패해도 나머지는 계속 올리고, 요청 크기도 작게 유지
    const results: TcxResult[] = [];
    setTcxProgress({ done: 0, total: files.length });
    for (const file of files) {
      const fd = new FormData();
      fd.append("tcx", file);
      fd.append("route_type", "road");
      try {
        const res = await api.upload<{
          data: Activity;
          duplicate?: boolean;
          filled?: string[];
        }>("/records/import/tcx", fd);
        results.push({
          name: file.name,
          status: res.duplicate ? "duplicate" : "added",
          record: res.data,
          filled: !!res.filled?.length,
        });
      } catch (err: any) {
        results.push({
          name: file.name,
          status: "error",
          error: err.message || "업로드 실패",
        });
      }
      setTcxProgress({ done: results.length, total: files.length });
    }
    setTcxProgress(null);

    const added = results.filter((r) => r.status === "added").length;
    const dup = results.filter((r) => r.status === "duplicate").length;
    const failed = results.filter((r) => r.status === "error");
    // 이미 있던 기록에 경로·심박 같은 빠진 정보가 채워진 경우
    const filled = results.filter((r) => r.filled).length;
    if (added > 0) {
      // 추가된 기록이 있으면 결과 모달에서 훈련 종류를 바로 고름
      reload();
      setTcxResults(results);
    } else if (failed.length > 0) {
      showSnackbar(
        files.length === 1
          ? failed[0].error!
          : `TCX 실패 ${failed.length}개${dup ? ` · 중복 ${dup}개 건너뜀` : ""}`,
        "error",
      );
    } else if (filled > 0) {
      reload();
      showSnackbar(
        files.length === 1
          ? "이미 등록된 기록에 빠진 정보를 채웠습니다"
          : `모두 이미 등록된 기록입니다 (${filled}개는 빠진 정보를 채움)`,
        "info",
      );
    } else {
      showSnackbar(
        files.length === 1
          ? "이미 등록된 기록입니다"
          : `모두 이미 등록된 기록입니다 (${dup}개 건너뜀)`,
        "info",
      );
    }
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

  const handleDelete = (r: Activity) => {
    showConfirm("기록 삭제", "이 러닝 기록을 삭제하시겠습니까?", () =>
      deleteMut.mutate(r.id),
    );
  };

  const maxDist = Math.max(0, ...chartData.data);
  const barColors = chartData.data.map((v) =>
    v === maxDist && v > 0 ? "#00c896" : "rgba(0,200,150,0.2)",
  );

  // 불러오는 동안 '기록 없음' 화면이 먼저 보이지 않도록 함
  if (recordsPending || plansPending) {
    return (
      <div className="text-center py-24 text-[var(--text3)]">
        <i className="fas fa-spinner fa-spin text-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--navy)]">활동</h1>
          <p className="text-xs text-[var(--text3)] mt-0.5">
            러닝 기록과 통계
          </p>
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
            multiple
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
            disabled={!!tcxProgress}
            title="TCX 파일 여러 개를 한 번에 선택할 수 있습니다"
            className="btn-outline px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
          >
            {tcxProgress ? (
              <>
                <i className="fas fa-spinner fa-spin text-[var(--text3)]" />
                <span>
                  {tcxProgress.done}/{tcxProgress.total}
                </span>
              </>
            ) : (
              <>
                <i className="fas fa-route text-[var(--text3)]" />
                <span className="hidden sm:inline">TCX</span>
              </>
            )}
          </button>
          <button
            onClick={() => {
              setAddDate(undefined);
              setAddOpen(true);
            }}
            className="btn-mint px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            <i className="fas fa-plus" />
            <span className="hidden sm:inline">추가</span>
          </button>
        </div>
      </div>

      {/* View toggle (+ 캘린더 보기의 월 이동) */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div
          role="group"
          aria-label="보기 전환"
          className="flex gap-0.5 p-[3px] rounded-full bg-white border border-[var(--border)]"
        >
          {(["list", "calendar"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              aria-pressed={view === v}
              className={`act-tab flex items-center gap-1.5 ${view === v ? "active" : ""}`}
            >
              <i
                className={`fas ${v === "list" ? "fa-list" : "fa-calendar-alt"} text-[11px]`}
              />
              {v === "list" ? "목록" : "캘린더"}
            </button>
          ))}
        </div>
        {view === "calendar" && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => moveMonth(-1)}
              aria-label="이전 달"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors"
            >
              <i className="fas fa-chevron-left text-[10px]" />
            </button>
            <span className="text-sm font-bold text-[var(--navy)] min-w-[96px] text-center">
              {cal.y}년 {cal.m}월
            </span>
            <button
              onClick={() => moveMonth(1)}
              aria-label="다음 달"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] text-[var(--text2)] transition-colors"
            >
              <i className="fas fa-chevron-right text-[10px]" />
            </button>
            <button
              onClick={goToday}
              className="btn-outline px-3 py-1.5 text-xs"
            >
              오늘
            </button>
          </div>
        )}
      </div>

      {/* Tab + Period nav (목록 보기) */}
      <div
        className={`flex-wrap items-center gap-3 justify-between ${view === "list" ? "flex" : "hidden"}`}
      >
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-[var(--surface2)]">
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPidx((i) => Math.min(i + 1, periods.length - 1))}
            disabled={pidx >= periods.length - 1 || tab === "all"}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] text-[var(--text3)] disabled:opacity-20 transition-colors"
          >
            <i className="fas fa-chevron-left text-[10px]" />
          </button>
          <span className="text-sm font-bold text-[var(--navy)] min-w-[110px] text-center">
            {period?.label}
          </span>
          <button
            onClick={() => setPidx((i) => Math.max(i - 1, 0))}
            disabled={pidx <= 0 || tab === "all"}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] text-[var(--text3)] disabled:opacity-20 transition-colors"
          >
            <i className="fas fa-chevron-right text-[10px]" />
          </button>
        </div>
      </div>

      {/* 4 stat boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          {
            val: stats.dist > 0 ? stats.dist.toFixed(1) : "0",
            unit: "km",
            label: "총 거리",
          },
          { val: String(stats.count), unit: "회", label: "러닝" },
          { val: stats.pace, unit: "/km", label: "평균 페이스" },
          {
            val: stats.count > 0 ? stats.time : "–",
            unit: "",
            label: "총 시간",
          },
        ].map(({ val, unit, label }) => (
          <div
            key={label}
            className="bg-white border border-[var(--border)] rounded-xl px-4 py-3"
          >
            <p className="text-[0.6rem] text-[var(--text3)] uppercase tracking-wider mb-1.5">
              {label}
            </p>
            <p className="text-lg font-black text-[var(--navy)] leading-none tracking-tight">
              {val}
              {unit && (
                <span className="text-xs font-normal text-[var(--text3)] ml-0.5">
                  {unit}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Calendar (캘린더 보기) */}
      {view === "calendar" && (
        <ActivityCalendar
          year={cal.y}
          month={cal.m}
          records={allRecords}
          races={races}
          plans={plans}
          shoes={shoes}
          selected={selDate}
          onSelect={setSelDate}
          onOpenRecord={setSelectedActivity}
          onAdd={(date) => {
            setAddDate(date);
            setAddOpen(true);
          }}
          aside={
            <WeekPlanCard
              weekStart={weekStart}
              plans={weekPlans}
              onToggle={(plan, done) => togglePlanMut.mutate({ plan, done })}
              onEdit={() => setPlanEditOpen(true)}
            />
          }
          below={
            <ShoesCard
              shoes={shoes}
              onChanged={() => {
                qc.invalidateQueries({ queryKey: ["shoes"] });
                qc.invalidateQueries({ queryKey: ["records"] });
              }}
            />
          }
        />
      )}

      {/* Bar chart (목록 보기) */}
      <div
        style={{ height: 160 }}
        className={`bg-white rounded-xl px-5 py-4 border border-[var(--border)] ${view === "list" ? "" : "hidden"}`}
      >
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
                border: { display: true },
                ticks: { display: true },
              },
            },
          }}
        />
      </div>

      {/* Activity list (목록 보기) */}
      <div className={view === "list" ? "" : "hidden"}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-extrabold text-[var(--navy)]">
            활동 기록
          </h2>
          {allRecords.length > 0 && (
            <span className="text-xs text-[var(--text3)]">
              {allRecords.length}개
            </span>
          )}
        </div>

        {allRecords.length === 0 ? (
          <div className="bg-white border border-[var(--border)] rounded-2xl text-center py-16">
            <i className="fas fa-person-running text-4xl text-[var(--border)] block mb-3" />
            <p className="font-bold text-[var(--text2)]">
              아직 기록이 없습니다
            </p>
            <p className="text-xs text-[var(--text3)] mt-1">
              첫 러닝 기록을 추가해보세요
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[var(--border)] rounded-2xl overflow-hidden">
            {/* Horizontally scrollable table */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: 560 }}>
                {allRecords.map((r, idx) => {
                  const d = new Date(r.date + "T00:00:00");
                  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
                  const isSelected = selectedActivity?.id === r.id;

                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedActivity(r)}
                      className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#f5fffe]"
                          : "hover:bg-[var(--surface2)]"
                      } ${idx !== allRecords.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                    >
                      {/* Icon */}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mr-3"
                        style={{
                          background: isSelected
                            ? "rgba(0,200,150,0.15)"
                            : "rgba(0,200,150,0.08)",
                        }}
                      >
                        <i className="fas fa-person-running text-[var(--mint)] text-xs" />
                      </div>

                      {/* Date — fixed */}
                      <span className="text-xs text-[var(--text3)] w-[88px] shrink-0">
                        {dateStr}
                      </span>

                      {/* Distance — grows */}
                      <span className="flex-1 text-sm font-bold text-[var(--navy)]">
                        {r.distance.toFixed(2)}
                        <span className="text-xs font-normal text-[var(--text3)] ml-0.5">
                          km
                        </span>
                      </span>

                      {/* Pace — grows */}
                      <span className="flex-1 text-xs font-semibold text-[var(--text2)]">
                        {r.pace}
                        <span className="text-[var(--text3)] font-normal">
                          /km
                        </span>
                      </span>

                      {/* Time — grows */}
                      <span className="flex-1 text-xs text-[var(--text2)]">
                        {r.duration_formatted}
                      </span>

                      {/* Heart Rate — grows */}
                      <span className="flex-1 text-xs text-[var(--text2)] flex items-center gap-1">
                        <i className="fa-solid fa-heart text-[#F4320B] text-[9px]" />
                        {r.heartRate ? `${r.heartRate} bpm` : "—"}
                      </span>

                      {/* Run type tag — fixed */}
                      {runTypeLabels[r.runType] && (
                        <span className="shrink-0 mr-1.5 px-2 py-[0.15rem] rounded-full text-[0.6875rem] font-bold bg-[rgba(0,200,150,0.14)] text-[#00694f]">
                          {runTypeLabels[r.runType]}
                        </span>
                      )}

                      {/* Route tag — fixed */}
                      <span className="badge-gray shrink-0 mr-3">
                        {routeLabels[r.routeType] || "로드"}
                      </span>

                      {/* Chevron */}
                      <i
                        className="fas fa-chevron-right text-[10px] shrink-0 transition-colors"
                        style={{ color: isSelected ? "#00c896" : "#d1d9e0" }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity Detail Drawer */}
      {selectedActivity && (
        <ActivityDrawer
          record={selectedActivity}
          shoeName={
            shoes.find((s) => s.id === selectedActivity.shoeId)?.name
          }
          onClose={() => setSelectedActivity(null)}
          onEdit={(r) => setEditRec(r)}
          onDelete={handleDelete}
        />
      )}

      {/* Add / Edit form */}
      {(addOpen || editRec) && (
        <RecordForm
          record={editRec ?? undefined}
          defaultDate={addDate}
          shoes={shoes}
          onClose={() => {
            setAddOpen(false);
            setEditRec(null);
          }}
          onSaved={reload}
        />
      )}

      {/* TCX 업로드 결과 + 훈련 종류 선택 */}
      {tcxResults && (
        <TcxImportModal
          results={tcxResults}
          shoes={shoes}
          onClose={() => setTcxResults(null)}
          onSaved={reload}
        />
      )}

      {/* 주간 훈련 계획 편집 */}
      {planEditOpen && (
        <PlanEditModal
          weekStart={weekStart}
          plans={weekPlans}
          onClose={() => setPlanEditOpen(false)}
          onSaved={invalidatePlans}
        />
      )}
    </div>
  );
}
