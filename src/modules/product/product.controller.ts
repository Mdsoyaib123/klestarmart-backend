import type { Request, Response } from 'express'
import { conflict, notFound } from '@/lib/AppError'
import { created, ok } from '@/lib/respond'
import OrderModel from '@/modules/order/order.model'
import ProductModel from '@/modules/product/product.model'
import * as productService from '@/modules/product/product.service'
import { adminListQuery } from '@/modules/product/product.validation'

export const listPublic = async (req: Request, res: Response) => {
  ok(res, await productService.listActive())
}

export const getPublic = async (req: Request, res: Response) => {
  const product = await productService.findActive(String(req.params.idOrSlug))
  if (!product) throw notFound('Product')
  ok(res, product)
}

export const listAdmin = async (req: Request, res: Response) => {
  const { items, meta } = await productService.listAdmin(adminListQuery.parse(req.query))
  ok(res, items, { meta })
}

export const getAdmin = async (req: Request, res: Response) => {
  const product = await ProductModel.findById(req.params.id)
  if (!product) throw notFound('Product')
  ok(res, product)
}

export const create = async (req: Request, res: Response) => {
  created(res, await productService.create(req.body))
}

export const update = async (req: Request, res: Response) => {
  ok(res, await productService.update(String(req.params.id), req.body))
}

export const adjustStock = async (req: Request, res: Response) => {
  ok(res, await productService.adjustStock(String(req.params.id), req.body.change))
}

export const remove = async (req: Request, res: Response) => {
  const product = await ProductModel.findById(req.params.id)
  if (!product) throw notFound('Product')
  // Ordered products are kept so order history and sales reports stay intact.
  if (await OrderModel.exists({ 'items.product': product._id })) {
    throw conflict('This product has orders, so it cannot be deleted. Archive it instead.')
  }
  await product.deleteOne()
  ok(res, null)
}
