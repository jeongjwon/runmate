"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  ArcElement,
  Tooltip,
} from "chart.js";
import { api } from "@/src/lib/api";
import { Activity } from "@/src/types";
import { calcPace, formatDuration } from "@/src/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  ArcElement,
  Tooltip,
);

const DONUT_COLORS = ["#00c896", "#1b2d40", "#3b82f6", "#f59e0b"];

// ── 배지 상수 ──────────────────────────────────────────────
const BADGE_META: Record<string, { color: string; bg: string }> = {
  monthly_50km: { color: "#cd7f32", bg: "#fdf3e7" },
  monthly_100km: { color: "#9e9e9e", bg: "#f5f5f5" },
  monthly_150km: { color: "#f5a623", bg: "#fff8ec" },
  monthly_200km: { color: "#00c896", bg: "#f0fdf8" },
  streak_7d: { color: "#ef4444", bg: "#fef2f2" },
  streak_30d: { color: "#8b5cf6", bg: "#f5f3ff" },
  pb_distance: { color: "#3b82f6", bg: "#eff6ff" },
  pb_pace: { color: "#0891b2", bg: "#ecfeff" },
  pb_duration: { color: "#6366f1", bg: "#eef2ff" },
};

// ── 히트맵 색상 ───────────────────────────────────────────
function heatColor(dist: number): string {
  if (dist <= 0) return "#eef0f3";
  if (dist < 5) return "#bbf7e8";
  if (dist < 10) return "#34d399";
  return "#00c896";
}

// ── 히트맵 빌더 ───────────────────────────────────────────
function buildHeatmap(activities: Activity[]) {
  const distMap: Record<string, number> = {};
  for (const r of activities) {
    distMap[r.date] = (distMap[r.date] ?? 0) + r.distance;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 오늘 기준으로 일요일이 오른쪽 끝이 되도록 정렬
  const dow = today.getDay(); // 0=일
  const endSunday = new Date(today);
  endSunday.setDate(today.getDate() + (6 - dow));

  // 52주 × 7일
  const totalDays = 52 * 7;
  const startDay = new Date(endSunday);
  startDay.setDate(endSunday.getDate() - totalDays + 1);

  const weeks: { date: string; dist: number }[][] = [];
  let week: { date: string; dist: number }[] = [];

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    week.push({ date: dateStr, dist: distMap[dateStr] ?? 0 });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week);

  return weeks;
}

interface UserBadge {
  id: number;
  year: number | null;
  month: number | null;
  awardedAt: string;
  badge: {
    code: string;
    name: string;
    icon: string;
    type: string;
    threshold: number;
    unit: string;
  };
}
interface PersonalBests {
  bestDistance: {
    date: string;
    distance: number;
    duration: number;
    pace: string;
    duration_formatted: string;
  } | null;
  bestDuration: {
    date: string;
    distance: number;
    duration: number;
    pace: string;
    duration_formatted: string;
  } | null;
  bestPace: {
    date: string;
    distance: number;
    duration: number;
    pace: string;
    duration_formatted: string;
  } | null;
}

export default function StatsPage() {
  const { data, isLoading } = useQuery<{ data: Activity[] }>({
    queryKey: ["records"],
    queryFn: () => api.get("/records"),
  });
  const activities = data?.data ?? [];

  const { data: badgesData } = useQuery<{ data: UserBadge[] }>({
    queryKey: ["badges"],
    queryFn: () => api.get("/badges"),
    enabled: activities.length > 0,
  });
  const userBadges = badgesData?.data ?? [];

  const { data: pbData } = useQuery<{ data: PersonalBests }>({
    queryKey: ["personal-bests"],
    queryFn: () => api.get("/stats/personal-bests"),
    enabled: activities.length > 0,
  });
  const pbs = pbData?.data;

  const summary = useMemo(() => {
    const totalDist = activities.reduce((s, r) => s + r.distance, 0);
    const totalSec = activities.reduce((s, r) => s + r.duration, 0);
    return {
      totalDist,
      totalTime: formatDuration(totalSec),
      count: activities.length,
      avgPace: calcPace(totalDist, totalSec),
    };
  }, [activities]);

  const distRanges = useMemo(() => {
    const ranges = [
      { label: "5km 미만", min: 0, max: 5 },
      { label: "5-10km", min: 5, max: 10 },
      { label: "10-20km", min: 10, max: 20 },
      { label: "20km 이상", min: 20, max: Infinity },
    ];
    const counts = ranges.map(
      (r) =>
        activities.filter((a) => a.distance >= r.min && a.distance < r.max)
          .length,
    );
    const total = activities.length;
    const pcts = counts.map((c) =>
      total > 0 ? Math.round((c / total) * 100) : 0,
    );
    return { labels: ranges.map((r) => r.label), counts, pcts };
  }, [activities]);

  const dualYearChart = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const prevYear = curYear - 1;
    const months = Array.from({ length: 12 }, (_, i) => ({
      key: String(i + 1).padStart(2, "0"),
      label: `${i + 1}월`,
    }));
    const cur = months.map((m) =>
      activities
        .filter((r) => r.date.startsWith(`${curYear}-${m.key}`))
        .reduce((s, r) => s + r.distance, 0),
    );
    const prev = months.map((m) =>
      activities
        .filter((r) => r.date.startsWith(`${prevYear}-${m.key}`))
        .reduce((s, r) => s + r.distance, 0),
    );
    return { labels: months.map((m) => m.label), cur, prev, curYear, prevYear };
  }, [activities]);

  const paceChart = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${d.getMonth() + 1}월`,
      };
    });
    const data = months.map((m) => {
      const recs = activities.filter((r) => r.date.startsWith(m.key));
      if (!recs.length) return null;
      const dist = recs.reduce((s, r) => s + r.distance, 0);
      const sec = recs.reduce((s, r) => s + r.duration, 0);
      return dist > 0 ? sec / 60 / dist : null;
    });
    return { labels: months.map((m) => m.label), data };
  }, [activities]);

  const heatmapWeeks = useMemo(() => buildHeatmap(activities), [activities]);

  // 배지를 월별로 그룹핑 (월간 km 배지만)
  const badgesByMonth = useMemo(() => {
    const monthlyBadges = userBadges.filter(
      (b) => b.badge.type === "monthly_km" && b.year && b.month,
    );
    const grouped: Record<string, UserBadge[]> = {};
    for (const b of monthlyBadges) {
      const key = `${b.year}-${String(b.month!).padStart(2, "0")}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(b);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6);
  }, [userBadges]);

  const tooltipBase = {
    backgroundColor: "rgba(27,45,64,.95)",
    titleColor: "#9aaab8",
    bodyColor: "#fff",
    padding: 10,
    cornerRadius: 8,
    displayColors: false,
  };
  const lineScales = {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: "#9aaab8", font: { size: 10 }, maxRotation: 0, autoSkipPadding: 8 },
    },
    y: {
      beginAtZero: true,
      grid: { color: "rgba(0,0,0,0.04)" },
      border: { display: false },
      ticks: { color: "#9aaab8", font: { size: 10 } },
    },
  };

  if (isLoading) {
    return (
      <div className="text-center py-20 text-[var(--text3)]">
        <i className="fas fa-spinner fa-spin text-3xl" />
      </div>
    );
  }
  if (activities.length === 0) {
    return (
      <div className="text-center py-20">
        <i className="fas fa-chart-pie text-5xl text-[var(--border)] block mb-4" />
        <p className="font-bold text-[var(--text2)]">
          기록이 없어 통계를 표시할 수 없습니다
        </p>
        <p className="text-sm text-[var(--text3)] mt-1">
          활동 탭에서 러닝 기록을 추가해보세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-[var(--navy)]">통계</h1>
        <p className="text-xs text-[var(--text3)] mt-0.5">
          나의 러닝 데이터를 다양한 방식으로 분석해보세요
        </p>
      </div>

      {/* Tabs */}
      {/* <div className="flex gap-0.5 p-0.5 rounded-xl bg-[var(--surface2)] w-fit">
        {(["전체", "거리", "페이스", "시간"] as StatTab[]).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} className={`act-tab ${activeTab === t ? "active" : ""}`}>{t}</button>
        ))}
      </div> */}

      {/* Summary boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: "총 거리", value: summary.totalDist.toFixed(1), unit: "km" },
          { label: "러닝 횟수", value: String(summary.count), unit: "회" },
          { label: "평균 페이스", value: summary.avgPace, unit: "/km" },
          { label: "총 시간", value: summary.totalTime, unit: "" },
        ].map(({ label, value, unit }) => (
          <div
            key={label}
            className="bg-white border border-[var(--border)] rounded-xl px-4 py-3"
          >
            <p className="text-[0.6rem] font-semibold text-[var(--text3)] uppercase tracking-widest mb-1.5">
              {label}
            </p>
            <p className="text-lg font-black text-[var(--navy)] leading-none tracking-tight">
              {value}
              {unit && (
                <span className="text-xs font-normal text-[var(--text3)] ml-0.5">
                  {unit}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* ── 활동 히트맵 ── */}
      <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider">
            활동 히트맵
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text3)]">
            <span>적음</span>
            {["#eef0f3", "#bbf7e8", "#34d399", "#00c896"].map((c) => (
              <span
                key={c}
                className="w-3 h-3 rounded-sm inline-block"
                style={{ background: c }}
              />
            ))}
            <span>많음</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-[3px]" style={{ minWidth: 680 }}>
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map(({ date, dist }) => (
                  <div
                    key={date}
                    title={dist > 0 ? `${date}: ${dist.toFixed(1)}km` : date}
                    className="rounded-[2px] cursor-default"
                    style={{
                      width: 11,
                      height: 11,
                      background: heatColor(dist),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* 월 레이블 */}
          <div className="flex gap-[3px] mt-1" style={{ minWidth: 680 }}>
            {heatmapWeeks.map((week, wi) => {
              const firstDate = week[0]?.date ?? "";
              const day = parseInt(firstDate.slice(8, 10));
              const month = parseInt(firstDate.slice(5, 7));
              return (
                <div key={wi} style={{ width: 11 }}>
                  {day <= 7 && (
                    <span
                      className="text-[8px] text-[var(--text3)]"
                      style={{ writingMode: "horizontal-tb" }}
                    >
                      {month}월
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 월간 마일스톤 배지 ── */}
      {badgesByMonth.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            월간 마일스톤 배지
          </h2>
          <div className="space-y-3">
            {badgesByMonth.map(([ym, badges]) => {
              const [y, m] = ym.split("-");
              return (
                <div key={ym}>
                  <p className="text-[10px] font-semibold text-[var(--text3)] mb-1.5">
                    {y}년 {parseInt(m)}월
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {badges
                      .sort((a, b) => a.badge.threshold - b.badge.threshold)
                      .map((ub) => {
                        const meta = BADGE_META[ub.badge.code] ?? {
                          color: "#9aaab8",
                          bg: "#f5f5f5",
                        };
                        return (
                          <div
                            key={ub.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                            style={{
                              background: meta.bg,
                              color: meta.color,
                              border: `1px solid ${meta.color}22`,
                            }}
                          >
                            <span>{ub.badge.icon}</span>
                            <span>{ub.badge.name}</span>
                            <span className="opacity-60 text-[10px]">
                              {ub.badge.threshold}
                              {ub.badge.unit}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2×2 grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* 거리 분포 donut */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            거리 분포
          </h2>
          <div className="flex flex-col lg:flex-row items-center gap-5">
            <div
              className="relative shrink-0"
              style={{ width: 120, height: 120 }}
            >
              <Doughnut
                data={{
                  labels: distRanges.labels,
                  datasets: [
                    {
                      data: distRanges.counts,
                      backgroundColor: DONUT_COLORS,
                      borderWidth: 0,
                      hoverOffset: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...tooltipBase,
                      callbacks: {
                        label: (ctx) => `${ctx.label} ${ctx.raw}회`,
                      },
                    },
                  },
                  cutout: "68%",
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-black text-[var(--navy)] leading-none">
                  {summary.totalDist.toFixed(1)}
                </span>
                <span className="text-[0.55rem] text-[var(--text3)]">km</span>
              </div>
            </div>
            <div className="w-full lg:flex-1 space-y-2.5">
              {distRanges.labels.map((label, i) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: DONUT_COLORS[i] }}
                      />
                      <span className="text-xs text-[var(--text2)]">
                        {label}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[var(--navy)]">
                      {distRanges.pcts[i]}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--surface2)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${distRanges.pcts[i]}%`,
                        background: DONUT_COLORS[i],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 월별 거리 비교 */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
            <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider">
              월별 거리 비교
            </h2>
            <div className="flex items-center gap-3 text-[0.65rem] text-[var(--text3)]">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{ background: "#00c896" }}
                />
                {dualYearChart.prevYear}년
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{ background: "#1b2d40" }}
                />
                {dualYearChart.curYear}년
              </span>
            </div>
          </div>
          <div style={{ height: 160 }}>
            <Line
              data={{
                labels: dualYearChart.labels,
                datasets: [
                  {
                    label: `${dualYearChart.prevYear}년`,
                    data: dualYearChart.prev,
                    borderColor: "#00c896",
                    backgroundColor: "rgba(0,200,150,0.08)",
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: "#00c896",
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                    borderWidth: 2,
                  },
                  {
                    label: `${dualYearChart.curYear}년`,
                    data: dualYearChart.cur,
                    borderColor: "#1b2d40",
                    backgroundColor: "rgba(27,45,64,0.06)",
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: "#1b2d40",
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                    borderWidth: 2,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    ...tooltipBase,
                    callbacks: {
                      label: (ctx) =>
                        `${ctx.dataset.label} ${(ctx.raw as number).toFixed(1)} km`,
                    },
                  },
                },
                scales: {
                  ...lineScales,
                  y: {
                    ...lineScales.y,
                    ticks: {
                      ...lineScales.y.ticks,
                      callback: (v: any) => `${v}km`,
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* 페이스 추이 */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            기록 추이 (평균 페이스)
          </h2>
          <div style={{ height: 160 }}>
            <Line
              data={{
                labels: paceChart.labels,
                datasets: [
                  {
                    data: paceChart.data,
                    borderColor: "#00c896",
                    backgroundColor: (ctx) => {
                      const { ctx: c, chartArea } = ctx.chart;
                      if (!chartArea) return "rgba(0,200,150,0.06)";
                      const g = c.createLinearGradient(
                        0,
                        chartArea.top,
                        0,
                        chartArea.bottom,
                      );
                      g.addColorStop(0, "rgba(0,200,150,0.15)");
                      g.addColorStop(1, "rgba(0,200,150,0)");
                      return g;
                    },
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: "#00c896",
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                    borderWidth: 2,
                    spanGaps: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    ...tooltipBase,
                    callbacks: {
                      label: (ctx) => {
                        const v = ctx.raw as number | null;
                        if (v === null) return "기록 없음";
                        const min = Math.floor(v);
                        const sec = Math.round((v - min) * 60);
                        return `${min}'${String(sec).padStart(2, "0")}"/km`;
                      },
                    },
                  },
                },
                scales: {
                  ...lineScales,
                  y: {
                    ...lineScales.y,
                    reverse: true,
                    ticks: {
                      ...lineScales.y.ticks,
                      callback: (v: any) => {
                        const min = Math.floor(v);
                        const sec = Math.round((v - min) * 60);
                        return `${min}'${String(sec).padStart(2, "0")}"`;
                      },
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* ── 최고기록 ── */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            최고기록
          </h2>
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {[
              {
                label: "최장 거리",
                icon: "fa-road",
                record: pbs?.bestDistance,
                value: pbs?.bestDistance
                  ? `${pbs.bestDistance.distance.toFixed(2)} km`
                  : "—",
                sub: pbs?.bestDistance?.pace
                  ? `${pbs.bestDistance.pace}/km`
                  : "",
              },
              {
                label: "최고 페이스",
                icon: "fa-bolt",
                record: pbs?.bestPace,
                value: pbs?.bestPace?.pace ?? "—",
                sub: pbs?.bestPace
                  ? `${pbs.bestPace.distance.toFixed(1)}km`
                  : "",
              },
              {
                label: "최장 시간",
                icon: "fa-clock",
                record: pbs?.bestDuration,
                value: pbs?.bestDuration?.duration_formatted ?? "—",
                sub: pbs?.bestDuration
                  ? `${pbs.bestDuration.distance.toFixed(1)}km`
                  : "",
              },
            ].map(({ label, icon, record, value, sub }) => (
              <div key={label} className="flex items-center gap-3 py-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,200,150,0.08)" }}
                >
                  <i className={`fas ${icon} text-xs text-[var(--mint)]`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[var(--text3)]">{label}</p>
                  {record && (
                    <p className="text-[10px] text-[var(--text3)]">
                      {record.date}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--navy)]">
                    {value}
                  </p>
                  {sub && (
                    <p className="text-[10px] text-[var(--text3)]">{sub}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
