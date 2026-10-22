import { Router } from 'express'
import { validateBody } from '@/lib/validate'
import { requireCustomer, requireStaff } from '@/middlewares/auth'
import { authLimiter } from '@/middlewares/rateLimit'
import * as controller from '@/modules/auth/auth.controller'
import { changePasswordSchema, customerLoginSchema, registerSchema, staffLoginSchema, updateProfileSchema } from '@/modules/auth/auth.validation'

export const customerAuthRoutes = Router()
  .post('/register', authLimiter, validateBody(registerSchema), controller.register)
  .post('/login', authLimiter, validateBody(customerLoginSchema), controller.login)
  .post('/logout', controller.logout)
  .get('/me', requireCustomer, controller.me)
  .put('/me', requireCustomer, validateBody(updateProfileSchema), controller.updateProfile)
  .put('/password', requireCustomer, authLimiter, validateBody(changePasswordSchema), controller.changeCustomerPassword)

export const staffAuthRoutes = Router()
  .post('/login', authLimiter, validateBody(staffLoginSchema), controller.staffLogin)
  .post('/logout', controller.staffLogout)
  .get('/me', requireStaff, controller.me)
  .put('/password', requireStaff, authLimiter, validateBody(changePasswordSchema), controller.changeStaffPassword)
