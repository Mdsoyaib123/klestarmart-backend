import { Router } from 'express'
import { validateBody } from '@/lib/validate'
import { requireStaff } from '@/middlewares/auth'
import * as controller from '@/modules/product/product.controller'
import { productSchema, stockAdjustSchema } from '@/modules/product/product.validation'

export const publicProductRoutes = Router().get('/', controller.listPublic).get('/:idOrSlug', controller.getPublic)

export const adminProductRoutes = Router()
  .use(requireStaff)
  .get('/', controller.listAdmin)
  .post('/', validateBody(productSchema), controller.create)
  .get('/:id', controller.getAdmin)
  .put('/:id', validateBody(productSchema), controller.update)
  .post('/:id/stock', validateBody(stockAdjustSchema), controller.adjustStock)
  .delete('/:id', controller.remove)
