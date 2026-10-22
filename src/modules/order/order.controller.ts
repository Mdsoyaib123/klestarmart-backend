import type { Request, Response } from 'express'
import { created, ok } from '@/lib/respond'
import OrderModel from '@/modules/order/order.model'
import * as orderService from '@/modules/order/order.service'
import { orderListQuery } from '@/modules/order/order.validation'

export const checkout = async (req: Request, res: Response) => {
  const order = await orderService.placeOrder(req.body, req.user?.id)
  // The shopper sees their order, not internal bookkeeping.
  const { amountPaid: _paid, amountRefunded: _refunded, ...publicOrder } = order.toJSON() as Record<string, unknown>
  created(res, publicOrder)
}

export const myOrders = async (req: Request, res: Response) => {
  ok(res, await OrderModel.find({ user: req.user!.id }).select(orderService.CUSTOMER_ORDER_PROJECTION).sort({ createdAt: -1 }).limit(100))
}

export const list = async (req: Request, res: Response) => {
  const { items, meta } = await orderService.listOrders(orderListQuery.parse(req.query))
  ok(res, items, { meta })
}

export const detail = async (req: Request, res: Response) => {
  ok(res, await orderService.getOrder(String(req.params.id)))
}

export const updateStatus = async (req: Request, res: Response) => {
  ok(res, await orderService.updateStatus(String(req.params.id), req.body.status, req.body.note, req.user!))
}

export const recordPayment = async (req: Request, res: Response) => {
  created(res, await orderService.recordPayment(String(req.params.id), req.body, req.user!))
}
