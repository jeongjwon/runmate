'use client'

import { runTypeLabels } from '@/src/lib/utils'

// 훈련 종류 선택 버튼 묶음. 선택된 버튼을 다시 누르면 선택 해제('')
export default function RunTypePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div role="group" aria-label="훈련 종류" className="grid grid-cols-5 gap-1.5">
      {Object.entries(runTypeLabels).map(([key, label]) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? '' : key)}
            className={`py-2 rounded-lg border text-[13px] cursor-pointer transition-colors ${
              active
                ? 'bg-[var(--navy)] border-[var(--navy)] text-white font-bold'
                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text2)] font-semibold hover:bg-[var(--surface2)]'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
