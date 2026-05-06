'use client'

import { useUI } from '@/src/context/UIContext'

const CONFIG = {
  success: {
    icon: 'fa-check-circle',
    accent: '#00c896',
    bg: '#f0fdf8',
    text: '#0a7c5c',
    border: '#bbf0e0',
    label: '완료',
  },
  error: {
    icon: 'fa-exclamation-circle',
    accent: '#ef4444',
    bg: '#fef2f2',
    text: '#991b1b',
    border: '#fecaca',
    label: '오류',
  },
  info: {
    icon: 'fa-info-circle',
    accent: '#3b82f6',
    bg: '#eff6ff',
    text: '#1e40af',
    border: '#bfdbfe',
    label: '알림',
  },
}

export default function Snackbar() {
  const { snackbar } = useUI()
  const c = CONFIG[snackbar.type]

  return (
    <div
      className="fixed top-4 right-4 z-[90] pointer-events-none transition-all duration-300"
      style={{
        opacity: snackbar.visible ? 1 : 0,
        transform: snackbar.visible ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.96)',
      }}
    >
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg min-w-[220px] max-w-xs"
        style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
        }}
      >
        {/* accent bar */}
        <div
          className="shrink-0 w-1 self-stretch rounded-full"
          style={{ background: c.accent }}
        />
        <i
          className={`fas ${c.icon} mt-0.5 text-base shrink-0`}
          style={{ color: c.accent }}
        />
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: c.accent }}>
            {c.label}
          </span>
          <span className="text-sm font-medium leading-snug" style={{ color: c.text }}>
            {snackbar.msg}
          </span>
        </div>
      </div>
    </div>
  )
}
