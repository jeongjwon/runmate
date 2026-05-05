import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import cors from 'cors'
import path from 'path'
// @ts-ignore
import SQLiteStore from 'connect-sqlite3'

import { initPassport } from './auth'
import prisma from './db'
import { crawlAndSync } from './services/crawler'
import authRouter from './routes/auth'
import marathonsRouter from './routes/marathons'
import participationsRouter from './routes/participations'
import recordsRouter from './routes/records'
import statsRouter from './routes/stats'

const app  = express()
const PORT = process.env.PORT || 4000
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'
const Store = SQLiteStore(session)

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: FRONTEND, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(session({
  store: new Store({ db: 'sessions.db', dir: path.join(process.cwd(), '..') }) as any,
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}))

initPassport()
app.use(passport.initialize())
app.use(passport.session())

// ── Static files ──────────────────────────────────────────────
app.use('/static', express.static(path.join(process.cwd(), '../static')))
app.use('/uploads', express.static(path.join(process.cwd(), '../static/uploads')))

// ── API Routes ────────────────────────────────────────────────
app.use('/auth',             authRouter)
app.use('/api/me',           (req, res) => res.json({ user: req.user || null }))
app.use('/api/marathons',    marathonsRouter)
app.use('/api/participations', participationsRouter)
app.use('/api/records',      recordsRouter)
app.use('/api/stats',        statsRouter)

// ── Production: serve built React app ────────────────────────
if (process.env.NODE_ENV === 'production') {
  // __dirname = server/dist/ → ../../client/dist
  const clientDist = path.join(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.listen(PORT, async () => {
  console.log(`✅  Server running on http://localhost:${PORT}`)
  const count = await prisma.marathon.count()
  if (count === 0) {
    console.log('📡 마라톤 데이터 없음 — 크롤링 시작...')
    crawlAndSync()
      .then(r => console.log(`✅  ${r.message}`))
      .catch(e => console.error('❌  크롤링 실패:', e.message))
  }
})
