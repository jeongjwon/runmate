import { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next()
  res.status(401).json({ error: '로그인이 필요합니다' })
}
