import type { Request, Response, NextFunction, CookieOptions } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '@/config/env'
import { AppError } from '@/lib/AppError'
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

export const issueSession = (res: Response, cookie: string, userId: string) => {
  const token = jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: `${env.sessionDays}d` })
  res.cookie(cookie, token, cookieOptions())
}

export const clearSession = (res: Response, cookie: string) => {
  const { maxAge: _maxAge, ...options } = cookieOptions()
  res.clearCookie(cookie, options)
}

const readUser = async (req: Request, cookie: string) => {
  const token = req.cookies?.[cookie]
  if (typeof token !== 'string') return null
  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (typeof payload === 'string' || !payload.sub) return null
    // Looked up on every request so blocking a user or changing a role takes effect immediately.
    const user = await UserModel.findById(payload.sub).select('name role status').lean()
    if (!user || user.status !== 'active') return null
    return { id: String(user._id), name: user.name, role: user.role as Role }
  } catch {
    return null
  }
}

const authenticate =
  (cookie: string, roles: Role[], optional = false) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const user = await readUser(req, cookie)
    if (user && roles.includes(user.role)) {
      req.user = user
    } else if (!optional) {
      throw new AppError(401, 'Please sign in to continue')
    }
    next()
  }

export const requireStaff = authenticate(ADMIN_COOKIE, ['admin', 'staff'])
export const requireCustomer = authenticate(CUSTOMER_COOKIE, ['customer'])
export const optionalCustomer = authenticate(CUSTOMER_COOKIE, ['customer'], true)

// Use after requireStaff to restrict a route to admins.
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') throw new AppError(403, 'Only admins can do this')
  next()
}
