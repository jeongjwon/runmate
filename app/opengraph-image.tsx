import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'RunMate — 한국 마라톤 일정 & 러닝 기록'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#1b2d40',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px 96px',
        }}
      >
        {/* 상단 accent 라인 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{ width: 40, height: 4, background: '#00c896', borderRadius: 2 }} />
          <span style={{ color: '#00c896', fontSize: 18, fontWeight: 700, letterSpacing: '0.15em' }}>
            RUNMATE
          </span>
        </div>

        {/* 메인 타이틀 */}
        <div
          style={{
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: 24,
          }}
        >
          한국 마라톤
          <br />
          일정 & 러닝 기록
        </div>

        {/* 서브 텍스트 */}
        <div style={{ color: '#9aaab8', fontSize: 28, fontWeight: 400, lineHeight: 1.5 }}>
          대회 조회 · 참가 신청 · 기록 관리
        </div>

        {/* 우측 장식 원 */}
        <div
          style={{
            position: 'absolute',
            right: -80,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 480,
            height: 480,
            borderRadius: '50%',
            border: '2px solid rgba(0,200,150,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 320,
              height: 320,
              borderRadius: '50%',
              border: '2px solid rgba(0,200,150,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: '50%',
                background: 'rgba(0,200,150,0.12)',
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
