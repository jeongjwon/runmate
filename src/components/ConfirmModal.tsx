'use client'

import { useUI } from '@/src/context/UIContext'

export default function ConfirmModal() {
  const { confirm, closeConfirm } = useUI()
  if (!confirm.visible) return null

  const handleOk = () => { closeConfirm(); confirm.onConfirm() }

  return (
    <div
      onClick={closeConfirm}
      className="fixed inset-0 z-[60] bg-[rgba(27,45,64,0.45)] flex items-end justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
      >
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <i className="fas fa-trash text-red-500 text-lg" />
          </div>
          <p className="font-bold text-[var(--navy)] mb-1">{confirm.title}</p>
          <p className="text-sm text-[var(--text2)]">{confirm.message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={closeConfirm}
            className="flex-1 py-2.5 border border-[var(--border)] rounded-lg bg-white font-bold cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleOk}
            className="flex-1 py-2.5 border-none rounded-lg bg-red-500 text-white font-bold cursor-pointer"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}
