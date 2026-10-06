import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { validateBody } from '@/lib/validate'
import { requireCustomer, requireStaff } from '@/middlewares/auth'
import * as controller from '@/modules/auth/auth.controller'
import { changePasswordSchema, customerLoginSchema, registerSchema, staffLoginSchema, updateProfileSchema } from '@/modules/auth/auth.validation'

// Limits password guessing; successful logins do not count towards the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
})

export const customerAuthRoutes = Router()
  .post('/register', loginLimiter, validateBody(registerSchema), controller.register)
  .post('/login', loginLimiter, validateBody(customerLoginSchema), controller.login)
  .post('/logout', controller.logout)
  .get('/me', requireCustomer, controller.me)
  .put('/me', requireCustomer, validateBody(updateProfileSchema), controller.updateProfile)
  .put('/password', requireCustomer, validateBody(changePasswordSchema), controller.changePassword)

export const staffAuthRoutes = Router()
  .post('/login', loginLimiter, validateBody(staffLoginSchema), controller.staffLogin)
  .post('/logout', controller.staffLogout)
  .get('/me', requireStaff, controller.me)
  .put('/password', requireStaff, validateBody(changePasswordSchema), controller.changePassword)
