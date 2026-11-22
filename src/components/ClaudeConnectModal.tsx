'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/src/lib/api'
import { useUI } from '@/src/context/UIContext'

interface Connection {
  id: number
  clientName: string
  createdAt: string
  lastUsedAt: string | null
}

const dateText = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
}

// Claude 커넥터 연결 안내 + 연결된 앱 관리
export default function ClaudeConnectModal({ onClose }: { onClose: () => void }) {
  const { showSnackbar, showConfirm } = useUI()
  const qc = useQueryClient()
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const url = origin ? `${origin}/api/mcp` : ''
  const isLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin)

  const { data, isLoading } = useQuery<{ data: Connection[] }>({
    queryKey: ['mcp-connections'],
    queryFn: () => api.get('/me/connections'),
    staleTime: 0,
  })
  const connections = data?.data ?? []

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      showSnackbar('주소를 복사했습니다')
    } catch {
      showSnackbar('복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요', 'error')
    }
  }

  const disconnect = (c: Connection) => {
    showConfirm(
      '연결 해제',
      `‘${c.clientName || 'Claude'}’ 연결을 해제하시겠습니까? 해제하면 Claude에서 더 이상 내 기록과 계획에 접근할 수 없습니다.`,
      async () => {
        try {
          await api.delete(`/me/connections/${c.id}`)
          qc.invalidateQueries({ queryKey: ['mcp-connections'] })
          showSnackbar('연결을 해제했습니다')
        } catch (e: any) {
          showSnackbar(e.message, 'error')
        }
      },
      { confirmLabel: '해제하기' },
    )
  }

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
          <div>
            <h2 className="text-base font-extrabold text-[var(--navy)]">Claude 연동</h2>
            <p className="text-xs text-[var(--text2)] mt-0.5">
              Claude와 짠 훈련 계획이 RunMate에 저장되고, Claude가 내 러닝 기록을 볼 수 있습니다
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--surface2)] text-[var(--text2)]"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-bold mb-1.5 text-[var(--text2)]">커넥터 주소</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                aria-label="커넥터 주소"
                className="input-dark flex-1 min-w-0 font-mono text-xs"
              />
              <button onClick={copy} className="btn-outline shrink-0 px-3 text-xs font-bold">
                <i className="fas fa-copy mr-1.5" />
                복사
              </button>
            </div>
            {isLocal && (
              <p className="mt-1.5 text-[11.5px] text-[#c2410c]">
                지금은 내 컴퓨터에서만 열리는 주소입니다. Claude가 접속할 수 없으니 배포된 사이트에서 이 화면을 열어 주소를 복사하세요.
              </p>
            )}
          </div>

          <ol className="space-y-2.5 text-[13px] text-[var(--text)]">
            {[
              <>
                Claude(웹 또는 데스크톱 앱)에서 <b>설정 › 커넥터</b>를 열고 <b>커스텀 커넥터 추가</b>를 누릅니다.
              </>,
              <>
                이름에 <b>RunMate</b>, 주소에 위 커넥터 주소를 붙여 넣고 추가합니다.
              </>,
              <>
                <b>연결</b>을 누르면 RunMate 화면이 열립니다. 로그인한 뒤 <b>허용</b>을 누르면 끝입니다.
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-5 h-5 mt-px shrink-0 flex items-center justify-center rounded-full bg-[var(--navy)] text-white text-[11px] font-bold">
                  {i + 1}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11.5px] text-[var(--text3)]">
            한 번 추가하면 모바일 앱에서도 같은 계정으로 쓸 수 있습니다. 연결한 뒤 Claude에게 “이번 주 훈련 계획 짜서 RunMate에 저장해 줘”처럼 말해 보세요.
          </p>

          <div className="pt-4 border-t border-[var(--border)]">
            <p className="text-xs font-bold text-[var(--text2)] mb-2">연결된 앱</p>
            {isLoading ? (
              <p className="text-xs text-[var(--text3)]">불러오는 중…</p>
            ) : connections.length === 0 ? (
              <p className="text-xs text-[var(--text3)]">아직 연결된 앱이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-[var(--surface2)] border border-[var(--border)] rounded-xl"
                  >
                    <i className="fas fa-plug text-[var(--mint)] text-xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[var(--navy)] truncate">{c.clientName || 'Claude'}</p>
                      <p className="text-[11px] text-[var(--text3)]">
                        {dateText(c.createdAt)} 연결
                        {c.lastUsedAt ? ` · 마지막 사용 ${dateText(c.lastUsedAt)}` : ' · 아직 사용 안 함'}
                      </p>
                    </div>
                    <button
                      onClick={() => disconnect(c)}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                    >
                      해제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
