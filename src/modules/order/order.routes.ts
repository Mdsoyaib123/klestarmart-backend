import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { validateBody } from '@/lib/validate'
import { optionalCustomer, requireCustomer, requireStaff } from '@/middlewares/auth'
import * as controller from '@/modules/order/order.controller'
import { checkoutSchema, paymentRecordSchema, statusUpdateSchema } from '@/modules/order/order.validation'

// Slows down scripted fake orders.
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false })

export const publicOrderRoutes = Router().post('/', checkoutLimiter, optionalCustomer, validateBody(checkoutSchema), controller.checkout)

export const accountOrderRoutes = Router().get('/', requireCustomer, controller.myOrders)

export const adminOrderRoutes = Router()
  .use(requireStaff)
  .get('/', controller.list)
  .get('/:id', controller.detail)
  .patch('/:id/status', validateBody(statusUpdateSchema), controller.updateStatus)
  .post('/:id/payments', validateBody(paymentRecordSchema), controller.recordPayment)
