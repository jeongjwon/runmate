"use client";

import { useMemo, useState } from "react";
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

type StatTab = "전체" | "거리" | "페이스" | "시간";

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState<StatTab>("전체");

  const { data, isLoading } = useQuery<{ data: Activity[] }>({
    queryKey: ["records"],
    queryFn: () => api.get("/records"),
  });
  const activities = data?.data ?? [];

  const summary = useMemo(() => {
    const totalDist = activities.reduce((s, r) => s + r.distance, 0);
    const totalSec = activities.reduce((s, r) => s + r.duration, 0);
    const count = activities.length;
    return {
      totalDist,
      totalTime: formatDuration(totalSec),
      count,
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

  const topRuns = useMemo(
    () => [...activities].sort((a, b) => b.distance - a.distance).slice(0, 5),
    [activities],
  );

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
      ticks: { color: "#9aaab8", font: { size: 10 } },
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
      {/* TODO : [기간 선택: 월간 / 연간 / 전체] 로 변경 */}
      <div className="flex gap-0.5 p-0.5 rounded-xl bg-[var(--surface2)] w-fit">
        {(["전체", "거리", "페이스", "시간"] as StatTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`act-tab ${activeTab === t ? "active" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

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

      {/*  TODO : [월간 마일스톤]
 현재 거리 51.4km
 획득 배지: 스타터
 다음 목표: 꾸준러 100km
[획득한 배지]
50km 스타터 / 100km 꾸준러 / 150km 챌린저 ... */}

      {/* 2×2 grid */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Top-left: 거리 분포 donut */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            거리 분포
          </h2>
          <div className="flex items-center gap-5">
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
            <div className="flex-1 space-y-2.5">
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

        {/* Top-right: 월별 거리 비교 dual line */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
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

        {/* Bottom-left: 페이스 추이 */}
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
                      const chart = ctx.chart;
                      const { ctx: c, chartArea } = chart;
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

        {/* Bottom-right: TOP 5 */}
        {/* TODO : [최고 기록] // 최장 거리 / 최고 페이스 / 최장 시간 */}
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            최장 거리 TOP 5
          </h2>
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {topRuns.length === 0 ? (
              <p className="text-xs text-[var(--text3)] py-4 text-center">
                기록이 없습니다
              </p>
            ) : (
              topRuns.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 py-3">
                  <span
                    className="text-sm font-black w-5 text-center shrink-0"
                    style={{ color: i === 0 ? "#00c896" : "var(--text3)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.65rem] text-[var(--text3)]">
                      {r.date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-[var(--navy)]">
                      {r.distance.toFixed(2)}
                    </span>
                    <span className="text-xs text-[var(--text3)] ml-0.5">
                      km
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
