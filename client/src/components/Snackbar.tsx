import { useUI } from '@/context/UIContext'

export default function Snackbar() {
  const { snackbar } = useUI()
  const bg = snackbar.type === 'error' ? '#ef4444' : snackbar.type === 'info' ? '#1b2d40' : '#4ecba0'
  const icon = snackbar.type === 'error' ? 'fa-exclamation-circle' : snackbar.type === 'info' ? 'fa-info-circle' : 'fa-check-circle'

  return (
    <div style={{
      position: 'fixed', bottom: '5.5rem', left: '50%',
      transform: `translateX(-50%) translateY(${snackbar.visible ? '0' : '8px'})`,
      opacity: snackbar.visible ? 1 : 0,
      transition: 'opacity .3s, transform .3s',
      zIndex: 70, pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 1rem', borderRadius: '0.75rem',
        boxShadow: '0 4px 16px rgba(0,0,0,.18)',
        background: bg, color: '#fff',
        fontSize: '0.875rem', fontWeight: 700,
      }}>
        <i className={`fas ${icon}`} />
        <span>{snackbar.msg}</span>
      </div>
    </div>
  )
}
