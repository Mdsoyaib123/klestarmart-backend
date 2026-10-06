import type { Request, Response } from 'express'
import { ADMIN_COOKIE, CUSTOMER_COOKIE, clearSession, issueSession } from '@/middlewares/auth'
import { notFound } from '@/lib/AppError'
import UserModel from '@/modules/user/user.model'
import * as authService from '@/modules/auth/auth.service'

export const register = async (req: Request, res: Response) => {
  const user = await authService.registerCustomer(req.body)
  issueSession(res, CUSTOMER_COOKIE, String(user._id))
  res.status(201).json({ success: true, data: user })
}

export const login = async (req: Request, res: Response) => {
  const user = await authService.loginCustomer(req.body.identifier, req.body.password)
  issueSession(res, CUSTOMER_COOKIE, String(user._id))
  res.json({ success: true, data: user })
}

export const logout = (req: Request, res: Response) => {
  clearSession(res, CUSTOMER_COOKIE)
  res.json({ success: true, data: {} })
}

export const staffLogin = async (req: Request, res: Response) => {
  const user = await authService.loginStaff(req.body.email, req.body.password)
  issueSession(res, ADMIN_COOKIE, String(user._id))
  res.json({ success: true, data: user })
}

export const staffLogout = (req: Request, res: Response) => {
  clearSession(res, ADMIN_COOKIE)
  res.json({ success: true, data: {} })
}

export const me = async (req: Request, res: Response) => {
  const user = await authService.getProfile(req.user!.id)
  if (!user) throw notFound('Account')
  res.json({ success: true, data: user })
}

export const updateProfile = async (req: Request, res: Response) => {
  const user = await UserModel.findByIdAndUpdate(req.user!.id, req.body, { returnDocument: 'after', runValidators: true })
  if (!user) throw notFound('Account')
  res.json({ success: true, data: user })
}

export const changePassword = async (req: Request, res: Response) => {
  await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword)
  res.json({ success: true, data: {} })
}
