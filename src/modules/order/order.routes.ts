import { Router, type Request, type Response, type NextFunction } from 'express'
import { isValidObjectId } from 'mongoose'
import { AppError } from '@/lib/AppError'
import { validateBody } from '@/lib/validate'
import { optionalCustomer, requireCustomer, requireStaff } from '@/middlewares/auth'
import { checkoutLimiter } from '@/middlewares/rateLimit'
import * as controller from '@/modules/order/order.controller'
import { checkoutSchema, paymentRecordSchema, statusUpdateSchema } from '@/modules/order/order.validation'

// Orders are addressed by database id or by order number (KM100001).
const orderIdParam = (req: Request, res: Response, next: NextFunction, value: string) => {
  if (isValidObjectId(value) || /^KM\d{6,}$/.test(value)) {
    next()
    return
  }
  next(new AppError(400, 'That order id is not valid', { code: 'INVALID_ID' }))
}

export const publicOrderRoutes = Router().post('/', checkoutLimiter, optionalCustomer, validateBody(checkoutSchema), controller.checkout)

export const accountOrderRoutes = Router().get('/', requireCustomer, controller.myOrders)

export const adminOrderRoutes = Router()
  .param('id', orderIdParam)
  .use(requireStaff)
  .get('/', controller.list)
  .get('/:id', controller.detail)
  .patch('/:id/status', validateBody(statusUpdateSchema), controller.updateStatus)
  .post('/:id/payments', validateBody(paymentRecordSchema), controller.recordPayment)
