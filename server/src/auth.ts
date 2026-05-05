import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import KakaoStrategy from 'passport-kakao'
// @ts-ignore – passport-naver-v2 has no bundled types
import NaverStrategy from 'passport-naver-v2'
import prisma from './db'

export function initPassport() {
  // ── 직렬화 / 역직렬화 ────────────────────────────────────────
  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as { id: number }).id)
  })

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } })
      done(null, user)
    } catch (e) {
      done(e)
    }
  })

  // ── Google ───────────────────────────────────────────────────
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
    },
    async (_at, _rt, profile, done) => {
      try {
        const user = await upsertUser('google', profile.id, {
          name:    profile.displayName,
          email:   profile.emails?.[0]?.value,
          picture: profile.photos?.[0]?.value,
        })
        done(null, user)
      } catch (e) { done(e as Error) }
    }
  ))

  // ── Kakao ────────────────────────────────────────────────────
  passport.use(new KakaoStrategy(
    {
      clientID:    process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
      callbackURL: process.env.KAKAO_CALLBACK_URL || '/auth/kakao/callback',
    },
    async (_at: string, _rt: string, profile: any, done: any) => {
      try {
        const user = await upsertUser('kakao', String(profile.id), {
          name:    profile.displayName || profile.username || '카카오 사용자',
          email:   profile._json?.kakao_account?.email,
          picture: profile._json?.properties?.profile_image,
        })
        done(null, user)
      } catch (e) { done(e) }
    }
  ))

  // ── Naver ────────────────────────────────────────────────────
  passport.use(new NaverStrategy(
    {
      clientID:     process.env.NAVER_CLIENT_ID!,
      clientSecret: process.env.NAVER_CLIENT_SECRET!,
      callbackURL:  process.env.NAVER_CALLBACK_URL || '/auth/naver/callback',
    },
    async (_at: string, _rt: string, profile: any, done: any) => {
      try {
        const user = await upsertUser('naver', profile.id, {
          name:    profile.displayName || '네이버 사용자',
          email:   profile.email,
          picture: profile.profileImage,
        })
        done(null, user)
      } catch (e) { done(e) }
    }
  ))
}

async function upsertUser(
  provider: string,
  providerId: string,
  info: { name: string; email?: string; picture?: string }
) {
  return prisma.user.upsert({
    where:  { provider_providerId: { provider, providerId } },
    update: { name: info.name, email: info.email, picture: info.picture },
    create: { provider, providerId, ...info },
  })
}
