"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Chart, Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Filler,
  ArcElement,
  Tooltip,
} from "chart.js";
import { api } from "@/src/lib/api";
import { Activity, Participation, TrainingPlan } from "@/src/types";
import {
  addDays,
  calcPace,
  formatDuration,
  getMonday,
  toDateStr,
} from "@/src/lib/utils";
import {
  PB_EVENTS,
  STAT_PERIODS,
  StatPeriod,
  bestPaceRun,
  distancePBs,
  periodRange,
  runsBetween,
  totalsOf,
  weeklyStats,
} from "@/src/lib/stats";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Filler,
  ArcElement,
  Tooltip,
);

const DONUT_COLORS = ["#00c896", "#1b2d40", "#3b82f6", "#f59e0b"];
const WEEKS = 12; // 주간 거리 차트에 보이는 주 수

const UP_COLOR = "#00c896";
const DOWN_COLOR = "#f59e0b";

const md = (date: string) =>
  `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// 증감 표시용 시간. "1시간 5분" · "12분"
function roughDuration(sec: number): string {
  const min = Math.round(sec / 60);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}시간 ${min % 60}분` : `${min}분`;
}

interface Delta {
  text: string;
  good: boolean | null; // null = 변동 없음
}

function signed(diff: number, text: string): Delta {
  if (diff === 0) return { text: "변동 없음", good: null };
  return { text: `${diff > 0 ? "+" : "−"}${text}`, good: diff > 0 };
}

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
  // 이번 주 토요일이 오른쪽 끝이 되도록 정렬 (한 열 = 일요일 ~ 토요일)
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
    // toISOString() 은 UTC 기준이라 한국 시간에서는 하루 전 날짜가 나옴
    const dateStr = toDateStr(d);
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
  });
  const userBadges = badgesData?.data ?? [];

  const { data: pbData } = useQuery<{ data: PersonalBests }>({
    queryKey: ["personal-bests"],
    queryFn: () => api.get("/stats/personal-bests"),
  });
  const pbs = pbData?.data;

  const [period, setPeriod] = useState<StatPeriod>("month");
  const today = useMemo(() => toDateStr(new Date()), []);

  // 주간 차트 범위: 11주 전 월요일 ~ 이번 주 일요일
  const thisMonday = toDateStr(getMonday(new Date(today + "T00:00:00")));
  const planFrom = addDays(thisMonday, -7 * (WEEKS - 1));
  const planTo = addDays(thisMonday, 6);
  const { data: planData } = useQuery<{ data: TrainingPlan[] }>({
    queryKey: ["plans", planFrom, planTo],
    queryFn: () => api.get(`/plans?from=${planFrom}&to=${planTo}`),
  });
  const plans = planData?.data ?? [];

  const { data: partData } = useQuery<{ data: Participation[] }>({
    queryKey: ["participations"],
    queryFn: () => api.get("/participations"),
  });
  const participations = partData?.data ?? [];

  // 선택한 기간의 합계와, 직전 기간 같은 시점까지의 합계
  const periodStats = useMemo(() => {
    const range = periodRange(period, today);
    const runs =
      period === "all"
        ? activities
        : runsBetween(activities, range.from, range.to);
    const cur = totalsOf(runs);
    const prev = range.prev
      ? totalsOf(runsBetween(activities, range.prev.from, range.prev.to))
      : null;
    return { range, runs, cur, prev };
  }, [activities, period, today]);

  const summary = useMemo(() => {
    const { cur } = periodStats;
    return {
      totalDist: cur.dist,
      totalTime: formatDuration(cur.sec),
      count: cur.count,
      avgPace: calcPace(cur.dist, cur.sec),
    };
  }, [periodStats]);

  // 요약 박스 순서(거리 · 횟수 · 페이스 · 시간)에 맞춘 증감. 비교할 기록이 없으면 null
  const deltas = useMemo<(Delta | null)[] | null>(() => {
    const { cur, prev } = periodStats;
    if (!prev || prev.count === 0) return null;
    const dist = Math.round((cur.dist - prev.dist) * 10) / 10;
    const count = cur.count - prev.count;
    const sec = Math.round((cur.sec - prev.sec) / 60) * 60;
    // 페이스는 줄어드는 쪽이 좋아진 것
    const pace =
      cur.paceSec !== null && prev.paceSec !== null
        ? Math.round(cur.paceSec - prev.paceSec)
        : null;
    return [
      signed(dist, `${Math.abs(dist).toFixed(1)}km`),
      signed(count, `${Math.abs(count)}회`),
      pace === null
        ? null
        : pace === 0
          ? { text: "변동 없음", good: null }
          : {
              text: `${Math.abs(pace)}초 ${pace < 0 ? "빠름" : "느림"}`,
              good: pace < 0,
            },
      signed(sec, roughDuration(Math.abs(sec))),
    ];
  }, [periodStats]);

  const distRanges = useMemo(() => {
    const runs = periodStats.runs;
    const ranges = [
      { label: "5km 미만", min: 0, max: 5 },
      { label: "5-10km", min: 5, max: 10 },
      { label: "10-20km", min: 10, max: 20 },
      { label: "20km 이상", min: 20, max: Infinity },
    ];
    const counts = ranges.map(
      (r) =>
        runs.filter((a) => a.distance >= r.min && a.distance < r.max).length,
    );
    const total = runs.length;
    const pcts = counts.map((c) =>
      total > 0 ? Math.round((c / total) * 100) : 0,
    );
    return { labels: ranges.map((r) => r.label), counts, pcts };
  }, [periodStats]);

  const weeks = useMemo(
    () => weeklyStats(activities, plans, today, WEEKS),
    [activities, plans, today],
  );
  const hasPlans = weeks.some((w) => w.planned > 0);
  const thisWeekDist = weeks[weeks.length - 1]?.dist ?? 0;
  const last4Avg =
    weeks.slice(-5, -1).reduce((s, w) => s + w.dist, 0) /
    Math.max(1, weeks.slice(-5, -1).length);

  const eventPBs = useMemo(
    () => distancePBs(activities, participations),
    [activities, participations],
  );
  const bestPace = useMemo(() => bestPaceRun(activities), [activities]);

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

  const monthlyBadgesFlat = useMemo(() => {
    return userBadges
      .filter((b) => b.badge.type === "monthly_km" && b.year && b.month)
      .sort((a, b) => {
        const aKey = `${a.year}-${String(a.month!).padStart(2, "0")}`;
        const bKey = `${b.year}-${String(b.month!).padStart(2, "0")}`;
        return bKey.localeCompare(aKey);
      });
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

      {/* 기간 선택: 요약과 거리 분포에 적용 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-[var(--surface2)] w-fit">
          {STAT_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`act-tab ${period === p.key ? "active" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--text3)]">
          {periodStats.range.from
            ? `${md(periodStats.range.from)} ~ ${md(periodStats.range.to)}`
            : "전체 기간"}
        </span>
      </div>

      {/* Summary boxes */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            {
              label: "총 거리",
              value: summary.totalDist.toFixed(1),
              unit: "km",
            },
            { label: "러닝 횟수", value: String(summary.count), unit: "회" },
            { label: "평균 페이스", value: summary.avgPace, unit: "/km" },
            { label: "총 시간", value: summary.totalTime, unit: "" },
          ].map(({ label, value, unit }, i) => {
            const delta = deltas?.[i];
            return (
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
                {delta && (
                  <p
                    className="text-[10px] font-bold mt-1.5"
                    style={{
                      color:
                        delta.good === null
                          ? "var(--text3)"
                          : delta.good
                            ? UP_COLOR
                            : DOWN_COLOR,
                    }}
                  >
                    {delta.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {periodStats.range.prev && (
          <p className="text-[10px] text-[var(--text3)] mt-1.5">
            {deltas
              ? `증감은 ${periodStats.range.prevLabel}(${md(periodStats.range.prev.from)} ~ ${md(periodStats.range.prev.to)})와 비교한 값입니다`
              : `${periodStats.range.prevLabel}(${md(periodStats.range.prev.from)} ~ ${md(periodStats.range.prev.to)})는 기록이 없어 증감을 표시하지 않습니다`}
          </p>
        )}
      </div>

      {/* ── 주간 거리 · 계획 달성률 ── */}
      <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider">
            주간 거리
          </h2>
          <div className="flex items-center gap-3 text-[0.65rem] text-[var(--text3)]">
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ background: "#00c896" }}
              />
              거리
            </span>
            {hasPlans && (
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-0.5 rounded"
                  style={{ background: "#3b82f6" }}
                />
                계획 달성률
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--text3)] mb-4">
          이번 주{" "}
          <span className="font-bold text-[var(--navy)]">
            {thisWeekDist.toFixed(1)} km
          </span>{" "}
          · 직전 4주 평균 {last4Avg.toFixed(1)} km
        </p>
        <div style={{ height: 180 }}>
          <Chart
            type="bar"
            data={{
              labels: weeks.map((w) => w.label),
              datasets: [
                {
                  type: "bar" as const,
                  label: "거리",
                  data: weeks.map((w) => w.dist),
                  backgroundColor: weeks.map((w) =>
                    w.current ? "#1b2d40" : "#00c896",
                  ),
                  borderRadius: 4,
                  maxBarThickness: 28,
                  yAxisID: "y",
                  order: 1,
                },
                ...(hasPlans
                  ? [
                      {
                        type: "line" as const,
                        label: "계획 달성률",
                        data: weeks.map((w) => w.rate),
                        borderColor: "#3b82f6",
                        backgroundColor: "#3b82f6",
                        borderWidth: 2,
                        tension: 0.3,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        pointBackgroundColor: "#3b82f6",
                        pointBorderColor: "#fff",
                        pointBorderWidth: 2,
                        spanGaps: false,
                        yAxisID: "y1",
                        order: 0,
                      },
                    ]
                  : []),
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...tooltipBase,
                  callbacks: {
                    title: (items) => {
                      const w = weeks[items[0]?.dataIndex ?? 0];
                      return w ? `${md(w.from)} ~ ${md(w.to)}` : "";
                    },
                    label: (ctx) => {
                      const w = weeks[ctx.dataIndex];
                      if (ctx.dataset.yAxisID === "y1") {
                        return `계획 ${w.done}/${w.planned} 완료 (${w.rate}%)`;
                      }
                      return `${w.dist.toFixed(1)} km · ${w.count}회`;
                    },
                  },
                },
              },
              scales: {
                x: lineScales.x,
                y: {
                  ...lineScales.y,
                  ticks: {
                    ...lineScales.y.ticks,
                    callback: (v: any) => `${v}km`,
                  },
                },
                y1: {
                  display: hasPlans,
                  position: "right",
                  min: 0,
                  max: 100,
                  grid: { drawOnChartArea: false },
                  border: { display: false },
                  ticks: {
                    color: "#9aaab8",
                    font: { size: 10 },
                    stepSize: 50,
                    callback: (v: any) => `${v}%`,
                  },
                },
              },
            }}
          />
        </div>
        <p className="text-[10px] text-[var(--text3)] mt-3">
          {hasPlans
            ? "한 주는 월요일 ~ 일요일입니다. 달성률은 휴식을 뺀 훈련 계획 중 완료로 표시한 비율이고, 이번 주는 오늘까지의 계획만 셉니다."
            : "한 주는 월요일 ~ 일요일입니다. 활동 탭에서 훈련 계획을 세우면 주간 달성률이 함께 표시됩니다."}
        </p>
      </div>

      {/* ── 종목별 최고 기록 ── */}
      <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
          종목별 최고 기록
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PB_EVENTS.map((ev) => {
            const pb = eventPBs[ev.key];
            return (
              <div
                key={ev.key}
                className="rounded-xl px-4 py-3 bg-[var(--surface2)] min-w-0"
              >
                <p className="text-[0.6rem] font-semibold text-[var(--text3)] uppercase tracking-widest mb-1.5">
                  {ev.label}
                </p>
                <p
                  className={`text-lg font-black leading-none tracking-tight ${pb ? "text-[var(--navy)]" : "text-[var(--text3)]"}`}
                >
                  {pb ? formatDuration(Math.round(pb.seconds)) : "—"}
                </p>
                {pb ? (
                  <>
                    <p className="text-[10px] text-[var(--text2)] mt-1.5">
                      {calcPace(pb.distance, pb.seconds)}/km · {pb.date}
                    </p>
                    <p
                      className="text-[10px] text-[var(--text3)] truncate"
                      title={pb.source === "race" ? pb.name : undefined}
                    >
                      {pb.source === "race"
                        ? `대회 · ${pb.name}`
                        : `러닝 기록 · ${pb.distance.toFixed(2)}km`}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-[var(--text3)] mt-1.5">
                    기록 없음
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text3)] mt-3">
          내 마라톤에 입력한 완주 기록과, 거리가 종목 거리의 −2% ~ +5% 안에
          드는 러닝 기록 중 가장 빠른 것입니다.
        </p>
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
      {monthlyBadgesFlat.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider mb-4">
            월간 마일스톤 배지
          </h2>
          <div
            className="flex gap-3 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {monthlyBadgesFlat.map((ub) => {
              const meta = BADGE_META[ub.badge.code] ?? {
                color: "#9aaab8",
                bg: "#f5f5f5",
              };
              return (
                <div
                  key={ub.id}
                  className="flex flex-col items-center shrink-0 w-[72px] py-3 px-2 rounded-xl"
                  style={{
                    background: meta.bg,
                    border: `1px solid ${meta.color}22`,
                  }}
                >
                  <span className="text-3xl leading-none mb-2">
                    {ub.badge.icon}
                  </span>
                  <p
                    className="text-[10px] font-bold text-center leading-tight"
                    style={{ color: meta.color }}
                  >
                    {ub.badge.name}
                  </p>
                  <p className="text-[9px] text-[var(--text3)] mt-1 text-center">
                    {ub.year}년 {ub.month}월
                  </p>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-extrabold text-[var(--text2)] uppercase tracking-wider">
              거리 분포
            </h2>
            <span className="text-[0.65rem] text-[var(--text3)]">
              {STAT_PERIODS.find((p) => p.key === period)?.label}
            </span>
          </div>
          {periodStats.runs.length === 0 && (
            <p className="text-xs text-[var(--text3)] py-10 text-center">
              이 기간에는 기록이 없습니다
            </p>
          )}
          <div
            className={`flex-col lg:flex-row items-center gap-5 ${periodStats.runs.length === 0 ? "hidden" : "flex"}`}
          >
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
                    beginAtZero: false,
                    min: 4.5,
                    max: 9.0,
                    ticks: {
                      ...lineScales.y.ticks,
                      stepSize: 0.5,
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
                // 1km 전력 질주 같은 짧은 기록이 뽑히지 않도록 5km 이상만 봄
                label: "최고 페이스 (5km 이상)",
                icon: "fa-bolt",
                record: bestPace,
                value: bestPace
                  ? calcPace(bestPace.distance, bestPace.duration)
                  : "—",
                sub: bestPace ? `${bestPace.distance.toFixed(1)}km` : "",
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
