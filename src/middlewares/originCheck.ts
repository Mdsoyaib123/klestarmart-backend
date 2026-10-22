import type { Request, Response, NextFunction } from 'express'
import { env } from '@/config/env'
import { AppError } from '@/lib/AppError'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Defence in depth against cross-site request forgery: browsers always send an Origin header with
// cross-site writes, so a write from any origin other than the storefront or dashboard is refused.
// Requests without an Origin header (curl, server-to-server) are not affected.
export const originCheck = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.get('origin')
  if (SAFE_METHODS.has(req.method) || !origin || env.allowedOrigins.includes(origin)) {
    next()
    return
  }
  next(new AppError(403, 'Requests from this website are not allowed', { code: 'FORBIDDEN_ORIGIN' }))
}
