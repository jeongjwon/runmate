'use client'

import { useUI } from '@/src/context/UIContext'

export default function Snackbar() {
  const { snackbar } = useUI()

  const bgClass =
    snackbar.type === 'error'
      ? 'bg-red-500'
      : snackbar.type === 'info'
      ? 'bg-[var(--navy)]'
      : 'bg-[#4ecba0]'

  const icon =
    snackbar.type === 'error'
      ? 'fa-exclamation-circle'
      : snackbar.type === 'info'
      ? 'fa-info-circle'
      : 'fa-check-circle'

  return (
    <div
      className={`fixed bottom-22 left-1/2 z-[70] pointer-events-none whitespace-nowrap transition-all duration-300 ${
        snackbar.visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-2'
      }`}
      style={{ transform: `translateX(-50%) translateY(${snackbar.visible ? '0' : '8px'})` }}
    >
      <div
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-white text-sm font-bold ${bgClass}`}
      >
        <i className={`fas ${icon}`} />
        <span>{snackbar.msg}</span>
      </div>
    </div>
  )
}
