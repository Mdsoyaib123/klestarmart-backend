import { Router } from 'express'
import { objectIdParam, validateBody } from '@/lib/validate'
import { requireStaff } from '@/middlewares/auth'
import * as controller from '@/modules/category/category.controller'
import { categorySchema } from '@/modules/category/category.validation'

export const publicCategoryRoutes = Router().get('/', controller.listPublic)

export const adminCategoryRoutes = Router()
  .param('id', objectIdParam)
  .use(requireStaff)
  .get('/', controller.listAdmin)
  .post('/', validateBody(categorySchema), controller.create)
  .put('/:id', validateBody(categorySchema), controller.update)
  .delete('/:id', controller.remove)
