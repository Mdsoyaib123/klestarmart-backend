import type { Request, Response } from 'express'
import OrderModel from '@/modules/order/order.model'
import * as orderService from '@/modules/order/order.service'
import { orderListQuery } from '@/modules/order/order.validation'

export const checkout = async (req: Request, res: Response) => {
  const order = await orderService.placeOrder(req.body, req.user?.id)
  res.status(201).json({ success: true, data: order })
}

export const myOrders = async (req: Request, res: Response) => {
  const orders = await OrderModel.find({ user: req.user!.id }).sort({ createdAt: -1 }).limit(100)
  res.json({ success: true, data: orders })
}

export const list = async (req: Request, res: Response) => {
  const { items, meta } = await orderService.listOrders(orderListQuery.parse(req.query))
  res.json({ success: true, data: items, meta })
}

export const detail = async (req: Request, res: Response) => {
  res.json({ success: true, data: await orderService.getOrder(String(req.params.id)) })
}

export const updateStatus = async (req: Request, res: Response) => {
  const result = await orderService.updateStatus(String(req.params.id), req.body.status, req.body.note, req.user!)
  res.json({ success: true, data: result })
}

export const recordPayment = async (req: Request, res: Response) => {
  const result = await orderService.recordPayment(String(req.params.id), req.body, req.user!)
  res.status(201).json({ success: true, data: result })
}
