"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api";
import { supabase } from "@/src/lib/supabase";
import { Participation } from "@/src/types";
import { useUI } from "@/src/context/UIContext";

interface ParticipationsResponse {
  data: Participation[];
}

const FINISH_TIME_REGEX = /^\d{1,2}:\d{2}:\d{2}$/;
const CATS = ["5K", "10K", "Half", "Full", "기타"];

type EditForm = {
  category: string;
  finishTime: string;
  raceNotes: string;
  certificateUrl: string;
};

function dday(dateStr: string) {
  const race = new Date(dateStr.replace(/\./g, "-"));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((race.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

const catColor: Record<string, string> = {
  Full: "#0F2A3D", Half: "#00c896", "10K": "#3b82f6", "5K": "#8b5cf6", 기타: "#9aacb8",
};
function getCatColor(cat: string) {
  return catColor[cat] ?? "#9aacb8";
}

function calcPace(finishTime: string, cat: string): string {
  const distMap: Record<string, number> = {
    "5K": 5, "10K": 10, Half: 21.0975, Full: 42.195,
  };
  const dist = distMap[cat];
  if (!dist || !finishTime) return "";
  const parts = finishTime.split(":").map(Number);
  const totalSec =
    parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  const secPerKm = totalSec / dist;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}'${String(sec).padStart(2, "0")}"`;
}

export default function ParticipationsPage() {
  const qc = useQueryClient();
  const { showSnackbar, showConfirm } = useUI();
  const [editTarget, setEditTarget] = useState<Participation | null>(null);
  const [form, setForm] = useState<EditForm>({
    category: "", finishTime: "", raceNotes: "", certificateUrl: "",
  });
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery<ParticipationsResponse>({
    queryKey: ["participations"],
    queryFn: () => api.get("/participations"),
  });
  const participations = data?.data ?? [];

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/participations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participations"] });
      qc.invalidateQueries({ queryKey: ["marathons"] });
      showSnackbar("내 마라톤에서 제거되었습니다");
    },
    onError: (e: Error) => showSnackbar(e.message, "error"),
  });

  const updateMut = useMutation({
    mutationFn: ({ marathonId, body }: { marathonId: number; body: object }) =>
      api.put(`/participations/${marathonId}/record`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participations"] });
      setEditTarget(null);
      showSnackbar("기록이 업데이트되었습니다");
    },
    onError: (e: Error) => showSnackbar(e.message, "error"),
  });

  const openEdit = (p: Participation) => {
    setForm({
      category: p.category ?? "",
      finishTime: p.finishTime ?? "",
      raceNotes: p.raceNotes ?? "",
      certificateUrl: p.certificateUrl ?? "",
    });
    setEditTarget(p);
  };

  const handleCertUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `certificates/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("certificates")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from("certificates")
        .getPublicUrl(path);
      setForm((f) => ({ ...f, certificateUrl: urlData.publicUrl }));
      showSnackbar("기록증 업로드 완료");
    } catch {
      showSnackbar("업로드 실패. Supabase Storage 버킷을 확인해주세요", "error");
    } finally {
      setUploading(false);
    }
  };

  const submitEdit = () => {
    if (!editTarget) return;
    if (!form.category) { showSnackbar("종목을 선택해주세요", "error"); return; }
    if (!form.finishTime) { showSnackbar("완주 시간을 입력해주세요", "error"); return; }
    if (!FINISH_TIME_REGEX.test(form.finishTime)) {
      showSnackbar("완주시간 형식: H:MM:SS (예: 4:32:10)", "error");
      return;
    }
    updateMut.mutate({
      marathonId: editTarget.marathonId,
      body: {
        category: form.category,
        finish_time: form.finishTime,
        race_notes: form.raceNotes,
        certificate_url: form.certificateUrl,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-24 text-[var(--text3)]">
        <i className="fas fa-spinner fa-spin text-2xl" />
      </div>
    );
  }

  if (participations.length === 0) {
    return (
      <div className="text-center py-24">
        <i className="fas fa-trophy text-4xl mb-3 block text-[var(--border)]" />
        <p className="font-bold text-[var(--text2)]">참가 중인 대회가 없습니다</p>
        <p className="text-sm mt-1 text-[var(--text3)]">
          마라톤 일정에서 대회를 추가해보세요
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold text-[var(--navy)]">내 대회</h1>
          <p className="text-xs text-[var(--text3)] mt-0.5">
            {participations.length}개 대회 참가 중
          </p>
        </div>

        {/* 티켓 카드 목록 */}
        <div className="space-y-4">
          {participations.map((p) => {
            const finished = !!p.finishTime;
            const pace = p.finishTime ? calcPace(p.finishTime, p.category) : "";
            const catCol = getCatColor(p.category);

            return (
              <div
                key={p.id}
                className="rounded-2xl overflow-hidden"
                style={{
                  boxShadow: "0 4px 24px rgba(15,42,61,0.12), 0 1px 6px rgba(15,42,61,0.06)",
                }}
              >
                <div className="flex flex-col sm:flex-row">

                  {/* ══ 왼쪽 다크 패널 ══ */}
                  <div
                    className="relative flex flex-col justify-between px-4 py-4 overflow-hidden sm:shrink-0 sm:w-[42%]"
                    style={{ background: "#0F2A3D" }}
                  >
                    {/* 배경 장식 원 */}
                    <div
                      className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                    <div
                      className="absolute bottom-4 right-4 w-12 h-12 rounded-full pointer-events-none"
                      style={{ background: "rgba(255,255,255,0.03)" }}
                    />
                    {/* 장식 다이아몬드 */}
                    <div
                      className="absolute top-14 right-12 w-1.5 h-1.5 rotate-45 pointer-events-none"
                      style={{ background: "rgba(0,200,150,0.7)" }}
                    />
                    <div
                      className="absolute bottom-10 left-28 w-1 h-1 rotate-45 pointer-events-none"
                      style={{ background: "rgba(255,255,255,0.25)" }}
                    />

                    {/* 상단: 뱃지 행 */}
                    <div className="flex flex-wrap items-center gap-2 relative z-10">
                      <span
                        className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-wide"
                        style={{ background: "#00c896", color: "white" }}
                      >
                        FinishR
                      </span>
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: catCol + "33",
                          color: p.category === "Full" ? "rgba(255,255,255,0.8)" : catCol,
                          border: `1px solid ${catCol}55`,
                        }}
                      >
                        {p.category || "미정"}
                      </span>
                      {finished && (
                        <span
                          className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(0,200,150,0.18)", color: "#00c896" }}
                        >
                          ✓ 완주
                        </span>
                      )}
                    </div>

                    {/* 중단: 대회명 */}
                    <div className="relative z-10 flex-1 flex items-center py-2">
                      <p
                        className="font-extrabold text-white leading-snug line-clamp-2"
                        style={{ fontSize: "0.875rem" }}
                      >
                        {p.marathon.name}
                      </p>
                    </div>

                    {/* 하단: 날짜 + 장소 */}
                    <div className="space-y-1 relative z-10">
                      <div
                        className="flex items-center gap-2 text-[10px]"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        <i className="fas fa-calendar-alt" style={{ width: 12, textAlign: "center" }} />
                        <span>{p.marathon.date}</span>
                      </div>
                      <div
                        className="flex items-center gap-2 text-[10px] truncate"
                        style={{ color: "rgba(255,255,255,0.55)" }}
                      >
                        <i className="fas fa-map-marker-alt" style={{ width: 12, textAlign: "center" }} />
                        <span className="truncate">{p.marathon.location || p.marathon.city}</span>
                      </div>
                    </div>
                  </div>

                  {/* ══ 모바일 가로 구분선 ══ */}
                  <div className="sm:hidden flex items-center px-4 py-0" style={{ background: "#0F2A3D" }}>
                    <div className="w-3 h-3 rounded-full shrink-0 -ml-4" style={{ background: "#f5f6f8", border: "1.5px solid #dde1e7" }} />
                    <div className="flex-1 mx-1" style={{ borderTop: "2px dashed rgba(255,255,255,0.2)" }} />
                    <div className="w-3 h-3 rounded-full shrink-0 -mr-4" style={{ background: "#f5f6f8", border: "1.5px solid #dde1e7" }} />
                  </div>

                  {/* ══ 세로 구분선 (데스크톱) ══ */}
                  <div
                    className="relative shrink-0 hidden sm:flex flex-col items-center py-4"
                    style={{
                      width: 20,
                      background: "linear-gradient(to right, #0F2A3D 50%, #ffffff 50%)",
                    }}
                  >
                    {/* 상단 리벳 */}
                    <div
                      className="w-3 h-3 rounded-full shrink-0 relative z-10"
                      style={{
                        background: "#f5f6f8",
                        border: "1.5px solid #dde1e7",
                        boxShadow: "0 0 0 2px #0F2A3D",
                      }}
                    />
                    {/* 점선 */}
                    <div
                      className="flex-1 my-1.5"
                      style={{ borderLeft: "2px dashed rgba(255,255,255,0.25)" }}
                    />
                    {/* 하단 리벳 */}
                    <div
                      className="w-3 h-3 rounded-full shrink-0 relative z-10"
                      style={{
                        background: "#f5f6f8",
                        border: "1.5px solid #dde1e7",
                        boxShadow: "0 0 0 2px #0F2A3D",
                      }}
                    />
                  </div>

                  {/* ══ 오른쪽 흰 패널 ══ */}
                  <div className="flex-1 bg-white flex flex-col justify-between px-4 py-4 gap-3">

                    {/* 상단: FINISH TIME */}
                    <div>
                      <p
                        className="text-[8px] font-black uppercase tracking-[0.28em] mb-1"
                        style={{ color: "#b0bec5" }}
                      >
                        {finished ? "Finish Time" : "Race Day"}
                      </p>
                      <p
                        className="font-black leading-none tracking-tight"
                        style={{
                          fontSize: "clamp(1.6rem, 3.2vw, 2.2rem)",
                          color: finished ? "#1b2d40" : "#1b2d40",
                        }}
                      >
                        {finished ? p.finishTime : dday(p.marathon.date)}
                      </p>
                    </div>

                    {/* 중단: 정보 칩 */}
                    <div className="flex flex-wrap gap-1.5">
                      {p.category && (
                        <span
                          className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: "#f1f3f5", color: "#5a6e7e" }}
                        >
                          <i className="fas fa-road mr-1.5 text-[8px]" />
                          {p.category}
                        </span>
                      )}
                      {pace && (
                        <span
                          className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-lg"
                          style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}
                        >
                          <i className="fas fa-stopwatch mr-1.5 text-[8px]" />
                          {pace}/km
                        </span>
                      )}
                      {!finished && p.marathon.entryFee > 0 && (
                        <span
                          className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: "#f1f3f5", color: "#5a6e7e" }}
                        >
                          {p.marathon.entryFee.toLocaleString()}원
                        </span>
                      )}
                    </div>

                    {/* 하단: 액션 버튼 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEdit(p)}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-colors hover:bg-[var(--surface2)] whitespace-nowrap"
                        style={{ borderColor: "#e8eaed", color: "#5a6e7e" }}
                      >
                        기록 수정
                      </button>
                      {p.certificateUrl && (
                        <a
                          href={p.certificateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap"
                          style={{ borderColor: "rgba(0,200,150,0.35)", color: "#00c896" }}
                        >
                          <i className="fas fa-medal text-[9px]" />기록증
                        </a>
                      )}
                      <button
                        onClick={() =>
                          showConfirm(
                            "대회 제거",
                            `${p.marathon.name}을(를) 제거하시겠습니까?`,
                            () => delMut.mutate(p.id),
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap"
                        style={{ borderColor: "#fca5a5", color: "#ef4444" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fef2f2"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 기록 편집 모달 */}
      {editTarget && (
        <div
          onClick={() => setEditTarget(null)}
          className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
          >
            <div className="px-5 pt-5 pb-4 border-b border-[var(--border)]">
              <h3 className="font-bold text-[var(--navy)]">기록 편집</h3>
              <p className="text-xs text-[var(--text3)] mt-0.5 truncate">{editTarget.marathon.name}</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="flex items-center gap-1 text-xs font-bold mb-2 text-[var(--text2)]">
                  종목 <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm((f) => ({ ...f, category: c }))}
                      className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${
                        form.category === c
                          ? "bg-[var(--mint)] text-white border-[var(--mint)]"
                          : "border-[var(--border)] text-[var(--text2)]"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1 text-xs font-bold mb-1.5 text-[var(--text2)]">
                  완주 시간 <span className="text-red-400">*</span>
                </label>
                <input
                  className="input-dark w-full"
                  placeholder="H:MM:SS (예: 4:32:10)"
                  value={form.finishTime}
                  onChange={(e) => setForm((f) => ({ ...f, finishTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">레이스 메모</label>
                <textarea
                  className="input-dark w-full resize-none"
                  rows={3}
                  placeholder="레이스 후기..."
                  value={form.raceNotes}
                  onChange={(e) => setForm((f) => ({ ...f, raceNotes: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">기록증</label>
                {form.certificateUrl ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--surface2)] border border-[var(--border)]">
                    <i className="fas fa-medal text-yellow-500" />
                    <a
                      href={form.certificateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[var(--mint)] font-bold flex-1 truncate hover:underline"
                    >
                      기록증 보기
                    </a>
                    <button
                      onClick={() => setForm((f) => ({ ...f, certificateUrl: "" }))}
                      className="text-[var(--text3)] hover:text-red-400"
                    >
                      <i className="fas fa-times text-xs" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                      uploading ? "opacity-50 pointer-events-none" : "border-[var(--border)] hover:border-[var(--mint)]"
                    }`}
                  >
                    <i className={`fas ${uploading ? "fa-spinner fa-spin" : "fa-cloud-upload-alt"} text-[var(--text3)]`} />
                    <span className="text-xs font-bold text-[var(--text3)]">
                      {uploading ? "업로드 중..." : "이미지 또는 PDF"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCertUpload(f); }}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setEditTarget(null)} className="flex-1 btn-outline py-2 text-sm">취소</button>
              <button onClick={submitEdit} disabled={updateMut.isPending} className="flex-1 btn-mint py-2 text-sm">
                {updateMut.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
