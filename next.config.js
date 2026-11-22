/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'k.kakaocdn.net' },
      { protocol: 'http', hostname: 'k.kakaocdn.net' },
      { protocol: 'https', hostname: 'phinf.pstatic.net' },
    ],
  },
  // Claude 커넥터(MCP)가 OAuth 설정을 찾는 표준 경로. 뒤에 /api/mcp 가 붙은 형태로도 조회한다
  // 연결 동의 화면은 다른 사이트의 iframe 안에 넣을 수 없게 함 (클릭재킹 방지)
  async headers() {
    return [
      {
        source: '/oauth/authorize',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/api/oauth/protected-resource' },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/api/oauth/authorization-server' },
    ]
  },
}
module.exports = nextConfig
