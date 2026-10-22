import type { Request, Response } from 'express'
import { notFound } from '@/lib/AppError'
import { ok, created } from '@/lib/respond'
import { ADMIN_COOKIE, CUSTOMER_COOKIE, clearSession, issueSession } from '@/middlewares/auth'
import * as authService from '@/modules/auth/auth.service'
import UserModel from '@/modules/user/user.model'

export const register = async (req: Request, res: Response) => {
  const user = await authService.registerCustomer(req.body)
  issueSession(res, CUSTOMER_COOKIE, user)
  created(res, user)
}

export const login = async (req: Request, res: Response) => {
  const user = await authService.loginCustomer(req.body.identifier, req.body.password)
  issueSession(res, CUSTOMER_COOKIE, user)
  ok(res, user)
}

export const logout = (req: Request, res: Response) => {
  clearSession(res, CUSTOMER_COOKIE)
  ok(res, null)
}

export const staffLogin = async (req: Request, res: Response) => {
  const user = await authService.loginStaff(req.body.email, req.body.password)
  issueSession(res, ADMIN_COOKIE, user)
  ok(res, user)
}

export const staffLogout = (req: Request, res: Response) => {
  clearSession(res, ADMIN_COOKIE)
  ok(res, null)
}

export const me = async (req: Request, res: Response) => {
  ok(res, await authService.getProfile(req.user!.id))
}

export const updateProfile = async (req: Request, res: Response) => {
  const { name, email } = req.body
  // A blank email arrives as undefined, which an update would skip; unset it so the email can be removed.
  const changes = email ? { name, email } : { name, $unset: { email: 1 } }
  const user = await UserModel.findByIdAndUpdate(req.user!.id, changes, { returnDocument: 'after', runValidators: true })
  if (!user) throw notFound('Account')
  ok(res, user)
}

// Other devices are signed out; this one gets a fresh session so the user stays signed in here.
const changePasswordFor = (cookie: string) => async (req: Request, res: Response) => {
  const user = await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword)
  issueSession(res, cookie, user)
  ok(res, null)
}

export const changeCustomerPassword = changePasswordFor(CUSTOMER_COOKIE)
export const changeStaffPassword = changePasswordFor(ADMIN_COOKIE)
