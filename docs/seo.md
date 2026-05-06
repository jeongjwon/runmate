# SEO

## 현재 상태

RunMate는 Next.js 14 App Router를 사용하므로 `app/layout.tsx`의 `metadata` 객체로 메타데이터를 관리합니다.  
현재는 기본 메타데이터만 설정되어 있으며, 아래는 개선 방향을 포함한 전체 SEO 가이드입니다.

## 기본 Metadata 설정

```ts
// app/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'RunMate — 한국 마라톤 일정 & 러닝 기록',
    template: '%s | RunMate',
  },
  description: '국내 마라톤 대회 일정 조회, 참가 신청, 러닝 기록 관리를 한 곳에서.',
  keywords: ['마라톤', '러닝', '달리기', '마라톤 일정', '마라톤 대회', '러닝 기록'],
  authors: [{ name: 'RunMate' }],
  creator: 'RunMate',
  metadataBase: new URL('https://runmate.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://runmate.vercel.app',
    siteName: 'RunMate',
    title: 'RunMate — 한국 마라톤 일정 & 러닝 기록',
    description: '국내 마라톤 대회 일정 조회, 참가 신청, 러닝 기록 관리.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RunMate' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RunMate',
    description: '한국 마라톤 일정 & 러닝 기록',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

## 페이지별 Metadata

페이지마다 `export const metadata`를 선언하면 `template`의 `%s`에 삽입됩니다.

```ts
// app/activity/page.tsx
export const metadata = {
  title: '활동 기록',
  description: '나의 러닝 기록과 통계를 확인하세요.',
}

// app/participations/page.tsx
export const metadata = {
  title: '내 마라톤',
  description: '참가 신청한 마라톤 대회와 완주 기록을 관리하세요.',
}
```

## 구조화 데이터 (JSON-LD)

마라톤 대회 페이지에 `SportsEvent` 스키마를 추가하면 구글 검색 결과에 리치 스니펫이 표시될 수 있습니다.

```tsx
// app/marathons/[id]/page.tsx
export default function MarathonDetailPage({ marathon }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: marathon.name,
    startDate: marathon.date,
    location: {
      '@type': 'Place',
      name: marathon.location,
      address: { '@type': 'PostalAddress', addressLocality: marathon.city, addressCountry: 'KR' },
    },
    url: marathon.officialUrl,
    description: marathon.description,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* 페이지 내용 */}
    </>
  )
}
```

## 크롤러 접근성

### robots.txt

```ts
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: 'https://runmate.vercel.app/sitemap.xml',
  }
}
```

### sitemap.xml

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://runmate.vercel.app', lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: 'https://runmate.vercel.app/marathons', lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
  ]
}
```

마라톤 상세 페이지가 생기면 DB에서 id 목록을 읽어 동적으로 생성합니다.

## 성능 (Core Web Vitals)

| 지표 | 현황 | 개선 방안 |
|------|------|-----------|
| LCP | 이미지 없음, 빠름 | OG 이미지 최적화 (`next/image`) |
| CLS | 폰트 교체 없음 | 현재 양호 |
| INP | 클라이언트 JS 최소화 | 서버 컴포넌트 비중 유지 |
| FCP | Next.js SSR | 현재 양호 |

Leaflet 지도는 `dynamic(..., { ssr: false })`로 지연 로딩해 초기 번들 크기를 줄입니다.

## 주의 사항

- **인증 필요 페이지** (`/activity`, `/participations`)는 `robots.txt`에서 크롤링을 막을 필요는 없지만, 개인 데이터이므로 구조화 데이터를 추가하지 않습니다.
- **마라톤 목록 페이지**는 공개 데이터이므로 SSG 또는 ISR 적용 시 검색 노출 효과가 있습니다. 현재는 서버에서 매 요청마다 렌더링합니다.
- `NEXTAUTH_URL`이 프로덕션 도메인과 일치해야 OAuth 리다이렉트와 메타데이터 URL이 정확하게 동작합니다.
