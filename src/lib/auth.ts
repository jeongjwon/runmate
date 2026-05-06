import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import prisma from '@/src/lib/prisma'

async function upsertUser(
  provider: string,
  providerId: string,
  info: { name: string; email?: string | null; picture?: string | null }
) {
  return prisma.user.upsert({
    where: { provider_providerId: { provider, providerId } },
    update: { name: info.name, email: info.email ?? undefined, picture: info.picture ?? undefined },
    create: {
      provider,
      providerId,
      name: info.name,
      email: info.email ?? undefined,
      picture: info.picture ?? undefined,
    },
  })
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    {
      id: 'kakao',
      name: 'Kakao',
      type: 'oauth',
      authorization: {
        url: 'https://kauth.kakao.com/oauth/authorize',
        params: { scope: 'profile_nickname profile_image account_email' },
      },
      token: 'https://kauth.kakao.com/oauth/token',
      userinfo: {
        url: 'https://kapi.kakao.com/v2/user/me',
        async request({ tokens, provider }: any) {
          const res = await fetch(provider.userinfo!.url as string, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          return res.json()
        },
      },
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
      profile(profile: any) {
        return {
          id: String(profile.id),
          name:
            profile.kakao_account?.profile?.nickname ||
            profile.properties?.nickname ||
            '카카오 사용자',
          email: profile.kakao_account?.email,
          image:
            profile.kakao_account?.profile?.profile_image_url ||
            profile.properties?.profile_image,
        }
      },
    },
    {
      id: 'naver',
      name: 'Naver',
      type: 'oauth',
      authorization: {
        url: 'https://nid.naver.com/oauth2.0/authorize',
        params: { scope: '' },
      },
      token: 'https://nid.naver.com/oauth2.0/token',
      userinfo: {
        url: 'https://openapi.naver.com/v1/nid/me',
        async request({ tokens, provider }: any) {
          const res = await fetch(provider.userinfo!.url as string, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          return res.json()
        },
      },
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
      profile(profile: any) {
        const r = profile.response ?? profile
        return {
          id: String(r.id),
          name: r.name || r.nickname || '네이버 사용자',
          email: r.email,
          image: r.profile_image,
        }
      },
    },
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async signIn({ user, account }) {
      if (!account) return false
      try {
        await upsertUser(account.provider, account.providerAccountId, {
          name: user.name ?? '사용자',
          email: user.email,
          picture: user.image,
        })
        return true
      } catch (e) {
        console.error('signIn upsert error:', e)
        return false
      }
    },

    async jwt({ token, account }) {
      if (account) {
        const dbUser = await prisma.user.findUnique({
          where: { provider_providerId: { provider: account.provider, providerId: account.providerAccountId } },
        })
        if (dbUser) token.dbUserId = dbUser.id
      } else if (token.dbUserId) {
        const exists = await prisma.user.findUnique({ where: { id: token.dbUserId as number } })
        if (!exists) token.dbUserId = undefined
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && token.dbUserId) {
        session.user.id = token.dbUserId as number
      }
      return session
    },
  },

  pages: { signIn: '/login' },
}
