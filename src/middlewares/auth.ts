import type { Request, Response, NextFunction, CookieOptions } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '@/config/env'
import { forbidden, unauthorized } from '@/lib/AppError'
import UserModel, { type Role } from '@/modules/user/user.model'

// Separate cookies so a customer session on the storefront never grants dashboard access.
export const ADMIN_COOKIE = 'km_admin'
export const CUSTOMER_COOKIE = 'km_customer'

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.isProduction || env.cookieSameSite === 'none',
  sameSite: env.cookieSameSite,
  path: '/',
  maxAge: env.sessionDays * 24 * 60 * 60 * 1000,
})

interface SessionToken {
  sub: string
  // The user's sessionVersion when the token was issued.
  v: number
}

export const issueSession = (res: Response, cookie: string, user: { _id: unknown; sessionVersion?: number | null }) => {
  const payload: SessionToken = { sub: String(user._id), v: user.sessionVersion ?? 0 }
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: `${env.sessionDays}d`, algorithm: 'HS256' })
  res.cookie(cookie, token, cookieOptions())
}

export const clearSession = (res: Response, cookie: string) => {
  const { maxAge: _maxAge, ...options } = cookieOptions()
  res.clearCookie(cookie, options)
}

const readUser = async (req: Request, cookie: string) => {
  const token = req.cookies?.[cookie]
  if (typeof token !== 'string') return null
  let payload: SessionToken
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] })
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null
    payload = { sub: decoded.sub, v: typeof decoded.v === 'number' ? decoded.v : 0 }
  } catch {
    // Expired, tampered with, or signed with an old secret: treat as signed out.
    return null
  }
  // Looked up on every request so blocking a user, changing a role or a password takes effect immediately.
  const user = await UserModel.findById(payload.sub).select('name role status +sessionVersion').lean()
  if (!user || user.status !== 'active' || (user.sessionVersion ?? 0) !== payload.v) return null
  return { id: String(user._id), name: user.name, role: user.role as Role }
}

const authenticate =
  (cookie: string, roles: Role[], optional = false) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await readUser(req, cookie)
    if (user && roles.includes(user.role)) {
      req.user = user
    } else if (!optional) {
      // A stale cookie is removed so the browser stops sending it.
      if (req.cookies?.[cookie]) clearSession(res, cookie)
      throw unauthorized()
    }
    next()
  }

export const requireStaff = authenticate(ADMIN_COOKIE, ['admin', 'staff'])
export const requireCustomer = authenticate(CUSTOMER_COOKIE, ['customer'])
export const optionalCustomer = authenticate(CUSTOMER_COOKIE, ['customer'], true)

// Use after requireStaff to restrict a route to admins.
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') throw forbidden('Only admins can do this')
  next()
}
