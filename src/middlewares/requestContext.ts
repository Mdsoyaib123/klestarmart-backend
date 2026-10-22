import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { logger } from '@/lib/logger'

// Accept a caller's request id (from a proxy or the frontend) only if it looks safe to log.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/

// Gives every request an id (echoed in the X-Request-Id header and in error bodies) and logs it once finished.
export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get('x-request-id')
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID()
  res.setHeader('X-Request-Id', req.id)

  const started = process.hrtime.bigint()
  res.on('finish', () => {
    // Health checks and successful image downloads would drown out the API traffic.
    if (req.path === '/health' || (req.originalUrl.startsWith('/uploads/') && res.statusCode < 400)) return
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10
    const fields = { requestId: req.id, method: req.method, path: req.originalUrl, status: res.statusCode, durationMs, ip: req.ip, userId: req.user?.id }
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`
    if (res.statusCode >= 500) logger.error(message, fields)
    else if (res.statusCode >= 400) logger.warn(message, fields)
    else logger.info(message, fields)
  })
  next()
}
