import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { User } from '@/types'
import Snackbar from './Snackbar'
import ConfirmModal from './ConfirmModal'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)

  const { data } = useQuery<{ user: User | null }>({
    queryKey: ['me'],
    queryFn: () => api.get('/me'),
    staleTime: Infinity,
  })
  const user = data?.user

  const navLinks = [
    { to: '/',              icon: 'fa-flag-checkered', label: '마라톤' },
    ...(user ? [
      { to: '/participations', icon: 'fa-star',          label: '내 마라톤' },
      { to: '/activity',      icon: 'fa-person-running', label: '활동'     },
    ] : []),
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* ── 상단 네비게이션 ── */}
      <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 font-extrabold text-lg shrink-0" style={{ color: 'var(--navy)' }}>
              <img src="/favicon.png" className="w-8 h-8 rounded-xl" alt="logo" />
              RUN<span style={{ color: 'var(--mint)' }}>MATE</span>
            </Link>

            {/* 데스크톱 메뉴 */}
            <div className="hidden sm:flex items-center gap-0.5">
              {navLinks.map(l => (
                <Link key={l.to} to={l.to} className="nav-item px-3 py-2 text-sm font-semibold"
                  style={{ color: 'var(--text2)' }}
                  data-active={location.pathname === l.to}>
                  <i className={`fas ${l.icon} mr-1`} />{l.label}
                </Link>
              ))}
              {user ? (
                <div className="relative ml-2">
                  <button onClick={() => setDropOpen(o => !o)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#F0EFEA]"
                    style={{ color: 'var(--text)' }}>
                    {user.picture
                      ? <img src={user.picture} className="w-7 h-7 rounded-full border-2 object-cover" style={{ borderColor: 'var(--mint)' }} />
                      : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--mint)' }}>{user.name[0]}</div>
                    }
                    <span className="text-sm font-semibold">{user.name}</span>
                    <i className="fas fa-chevron-down text-xs" style={{ color: 'var(--text3)' }} />
                  </button>
                  {dropOpen && (
                    <div onClick={() => setDropOpen(false)}
                      className="absolute right-0 top-full mt-1 rounded-xl shadow-xl py-1 w-48 z-50"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--navy)' }}>{user.name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{user.email}</p>
                      </div>
                      <button onClick={() => api.post('/auth/logout', {}).then(() => window.location.href = '/')}
                        className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-red-50"
                        style={{ color: '#ef4444' }}>
                        <i className="fas fa-sign-out-alt w-4" />로그아웃
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="btn-mint ml-2">로그인</Link>
              )}
            </div>

            {/* 모바일 햄버거 */}
            <button className="sm:hidden p-2 rounded-lg hover:bg-[#F0EFEA]"
              style={{ color: 'var(--text2)' }} onClick={() => setMenuOpen(o => !o)}>
              <i className="fas fa-bars text-lg" />
            </button>
          </div>
        </div>

        {/* 모바일 드롭다운 메뉴 */}
        {menuOpen && (
          <div className="sm:hidden border-t px-4 py-3 space-y-1"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            {navLinks.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
                className="nav-item flex items-center gap-3 px-3 py-2.5 text-sm font-semibold"
                style={{ color: 'var(--text2)' }}>
                <i className={`fas ${l.icon} w-4 text-center`} />{l.label}
              </Link>
            ))}
            {user ? (
              <div className="pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 px-3 py-2">
                  {user.picture
                    ? <img src={user.picture} className="w-8 h-8 rounded-full object-cover border-2" style={{ borderColor: 'var(--mint)' }} />
                    : <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'var(--mint)' }}>{user.name[0]}</div>
                  }
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--navy)' }}>{user.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>{user.email}</p>
                  </div>
                </div>
                <button onClick={() => api.post('/auth/logout', {}).then(() => window.location.href = '/')}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-red-50"
                  style={{ color: '#ef4444' }}>
                  <i className="fas fa-sign-out-alt w-4 text-center" />로그아웃
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-mint flex items-center justify-center gap-2 py-2.5 w-full">
                <i className="fas fa-sign-in-alt" />로그인
              </Link>
            )}
          </div>
        )}
      </nav>

      {/* ── 본문 ── */}
      <main className="max-w-5xl mx-auto px-4 py-6 pb-24 sm:pb-10">
        {children}
      </main>

      {/* ── 모바일 하단 탭바 ── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 border-t z-40"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex">
          {navLinks.map(l => (
            <Link key={l.to} to={l.to}
              className="flex-1 flex flex-col items-center py-2.5 transition-colors"
              style={{ color: location.pathname === l.to ? 'var(--mint)' : 'var(--text3)' }}>
              <i className={`fas ${l.icon} text-lg mb-0.5`} />
              <span className="text-[10px] font-bold">{l.label}</span>
            </Link>
          ))}
          {!user && (
            <Link to="/login" className="flex-1 flex flex-col items-center py-2.5"
              style={{ color: 'var(--text3)' }}>
              <i className="fas fa-sign-in-alt text-lg mb-0.5" />
              <span className="text-[10px] font-bold">로그인</span>
            </Link>
          )}
        </div>
      </div>

      <Snackbar />
      <ConfirmModal />
    </div>
  )
}
