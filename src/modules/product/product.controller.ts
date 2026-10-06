import type { Request, Response } from 'express'
import { AppError, notFound } from '@/lib/AppError'
import OrderModel from '@/modules/order/order.model'
import ProductModel from '@/modules/product/product.model'
import * as productService from '@/modules/product/product.service'
import { adminListQuery } from '@/modules/product/product.validation'

export const listPublic = async (req: Request, res: Response) => {
  res.json({ success: true, data: await productService.listActive() })
}

export const getPublic = async (req: Request, res: Response) => {
  const product = await productService.findActive(String(req.params.idOrSlug))
  if (!product) throw notFound('Product')
  res.json({ success: true, data: product })
}

export const listAdmin = async (req: Request, res: Response) => {
  const { items, meta } = await productService.listAdmin(adminListQuery.parse(req.query))
  res.json({ success: true, data: items, meta })
}

export const getAdmin = async (req: Request, res: Response) => {
  const product = await ProductModel.findById(req.params.id)
  if (!product) throw notFound('Product')
  res.json({ success: true, data: product })
}

export const create = async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await productService.create(req.body) })
}

export const update = async (req: Request, res: Response) => {
  res.json({ success: true, data: await productService.update(String(req.params.id), req.body) })
}

export const adjustStock = async (req: Request, res: Response) => {
  res.json({ success: true, data: await productService.adjustStock(String(req.params.id), req.body.change) })
}

export const remove = async (req: Request, res: Response) => {
  const product = await ProductModel.findById(req.params.id)
  if (!product) throw notFound('Product')
  // Ordered products are kept so order history and sales reports stay intact.
  if (await OrderModel.exists({ 'items.product': product._id })) {
    throw new AppError(409, 'This product has orders, so it cannot be deleted. Archive it instead.')
  }
  await product.deleteOne()
  res.json({ success: true, data: {} })
}
