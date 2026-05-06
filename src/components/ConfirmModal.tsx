'use client'

import { useUI } from '@/src/context/UIContext'

export default function ConfirmModal() {
  const { confirm, closeConfirm } = useUI()
  if (!confirm.visible) return null

  const handleOk = () => { closeConfirm(); confirm.onConfirm() }
  const isPrimary = confirm.variant === 'primary'

  return (
    <div
      onClick={closeConfirm}
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[var(--surface)] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
      >
        <div className="text-center mb-5">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${isPrimary ? 'bg-[rgba(0,200,150,0.12)]' : 'bg-red-100'}`}>
            <i className={`text-lg ${isPrimary ? 'fas fa-sign-in-alt text-[var(--mint)]' : 'fas fa-trash text-red-500'}`} />
          </div>
          <p className="font-bold text-[var(--navy)] mb-1">{confirm.title}</p>
          <p className="text-sm text-[var(--text2)]">{confirm.message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={closeConfirm}
            className="flex-1 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--surface)] font-bold text-sm text-[var(--text2)] cursor-pointer hover:bg-[var(--surface2)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleOk}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-opacity hover:opacity-90 ${isPrimary ? 'bg-[var(--mint)]' : 'bg-red-500'}`}
          >
            {confirm.confirmLabel ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}
