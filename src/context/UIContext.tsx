'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface SnackbarState { msg: string; type: 'success' | 'error' | 'info'; visible: boolean }
interface ConfirmState  { title: string; message: string; onConfirm: () => void; visible: boolean; confirmLabel?: string; variant?: 'danger' | 'primary' }

interface UICtx {
  snackbar: SnackbarState
  confirm:  ConfirmState
  loginModal: boolean
  showSnackbar: (msg: string, type?: 'success' | 'error' | 'info') => void
  showConfirm:  (title: string, message: string, onConfirm: () => void, options?: { confirmLabel?: string; variant?: 'danger' | 'primary' }) => void
  closeConfirm: () => void
  openLogin:  () => void
  closeLogin: () => void
}

const UIContext = createContext<UICtx>(null!)

export function UIProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState>({ msg: '', type: 'success', visible: false })
  const [confirm,  setConfirm]  = useState<ConfirmState>({ title: '', message: '', onConfirm: () => {}, visible: false, confirmLabel: '확인', variant: 'danger' })
  const [loginModal, setLoginModal] = useState(false)
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>()

  const showSnackbar = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    clearTimeout(timer)
    setSnackbar({ msg, type, visible: true })
    const t = setTimeout(() => setSnackbar(s => ({ ...s, visible: false })), 2500)
    setTimer(t)
  }, [timer])

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, options?: { confirmLabel?: string; variant?: 'danger' | 'primary' }) => {
    setConfirm({ title, message, onConfirm, visible: true, confirmLabel: options?.confirmLabel ?? '확인', variant: options?.variant ?? 'danger' })
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirm(s => ({ ...s, visible: false }))
  }, [])

  const openLogin  = useCallback(() => setLoginModal(true), [])
  const closeLogin = useCallback(() => setLoginModal(false), [])

  return (
    <UIContext.Provider value={{ snackbar, confirm, loginModal, showSnackbar, showConfirm, closeConfirm, openLogin, closeLogin }}>
      {children}
    </UIContext.Provider>
  )
}

export const useUI = () => useContext(UIContext)
