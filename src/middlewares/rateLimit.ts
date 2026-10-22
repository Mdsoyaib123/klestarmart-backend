import rateLimit, { type Options } from 'express-rate-limit'
import { env } from '@/config/env'
import { AppError } from '@/lib/AppError'

// Rate limiters that answer in the API's normal error format. Disabled in tests.
const limiter = (windowMs: number, limit: number, message: string, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res, next) => {
      next(new AppError(429, message, { code: 'RATE_LIMITED', details: { retryAfter: Math.ceil(windowMs / 1000) } }))
    },
    ...extra,
  })

// A generous ceiling for every API route, against scripted abuse.
export const apiLimiter = limiter(60 * 1000, 300, 'Too many requests. Please slow down and try again in a minute.')

// Password guessing; successful logins do not count.
export const authLimiter = limiter(15 * 60 * 1000, 10, 'Too many attempts. Please try again in 15 minutes.', { skipSuccessfulRequests: true })

// Scripted fake orders.
export const checkoutLimiter = limiter(15 * 60 * 1000, 20, 'Too many orders from this connection. Please try again later.')
