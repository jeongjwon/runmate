import { useUI } from '@/context/UIContext'

export default function ConfirmModal() {
  const { confirm, closeConfirm } = useUI()
  if (!confirm.visible) return null

  const handleOk = () => { closeConfirm(); confirm.onConfirm() }

  return (
    <div onClick={closeConfirm} style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(27,45,64,.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '1rem', padding: '1.5rem',
        width: '100%', maxWidth: '24rem', boxShadow: '0 20px 60px rgba(0,0,0,.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{
            width: '3rem', height: '3rem', borderRadius: '9999px',
            background: 'rgba(239,68,68,.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem',
          }}>
            <i className="fas fa-trash" style={{ color: '#ef4444', fontSize: '1.125rem' }} />
          </div>
          <p style={{ fontWeight: 700, color: '#1b2d40', marginBottom: '.25rem' }}>{confirm.title}</p>
          <p style={{ fontSize: '.875rem', color: '#5a6e7e' }}>{confirm.message}</p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button onClick={closeConfirm} style={{
            flex: 1, padding: '.625rem', border: '1px solid #e4e2da', borderRadius: '.5rem',
            background: '#fff', fontWeight: 700, cursor: 'pointer',
          }}>취소</button>
          <button onClick={handleOk} style={{
            flex: 1, padding: '.625rem', border: 'none', borderRadius: '.5rem',
            background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer',
          }}>삭제</button>
        </div>
      </div>
    </div>
  )
}
