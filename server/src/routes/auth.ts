import { Router } from 'express'
import passport from 'passport'

const router = Router()
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null })
  res.json({ user: req.user })
})

// ── Google ───────────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND}/login` }),
  (_req, res) => res.redirect(FRONTEND)
)

// ── Kakao ────────────────────────────────────────────────────
router.get('/kakao', passport.authenticate('kakao'))
router.get('/kakao/callback',
  passport.authenticate('kakao', { failureRedirect: `${FRONTEND}/login` }),
  (_req, res) => res.redirect(FRONTEND)
)

// ── Naver ────────────────────────────────────────────────────
router.get('/naver', passport.authenticate('naver'))
router.get('/naver/callback',
  passport.authenticate('naver', { failureRedirect: `${FRONTEND}/login` }),
  (_req, res) => res.redirect(FRONTEND)
)

// ── Logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.logout(() => res.json({ ok: true }))
})

export default router
