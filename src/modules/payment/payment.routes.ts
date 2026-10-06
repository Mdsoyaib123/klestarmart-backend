import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { pageMeta, paginationQuery, searchRegex } from '@/lib/pagination'
import { requireStaff } from '@/middlewares/auth'
import { PAYMENT_METHODS } from '@/modules/order/order.model'
import PaymentModel from '@/modules/payment/payment.model'

const listQuery = paginationQuery.extend({
  q: z.string().optional(),
  type: z.enum(['payment', 'refund']).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

// Payment history, with totals for the whole filtered range (not just the current page).
const list = async (req: Request, res: Response) => {
  const query = listQuery.parse(req.query)
  const filter: Record<string, unknown> = {}
  const search = searchRegex(query.q)
  if (search) filter.$or = [{ orderNumber: search }, { customerName: search }, { transactionId: search }]
  if (query.type) filter.type = query.type
  if (query.method) filter.method = query.method
  if (query.status) filter.status = query.status
  if (query.from || query.to) {
    filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) }
  }

  const [items, total, sums] = await Promise.all([
    PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    PaymentModel.countDocuments(filter),
    PaymentModel.aggregate<{ _id: { type: string; status: string }; amount: number }>([
      { $match: filter },
      { $group: { _id: { type: '$type', status: '$status' }, amount: { $sum: '$amount' } } },
    ]),
  ])

  const sum = (type: string, status: string) => sums.find((row) => row._id.type === type && row._id.status === status)?.amount ?? 0
  const summary = {
    collected: sum('payment', 'completed'),
    pending: sum('payment', 'pending'),
    refunded: sum('refund', 'completed'),
    net: sum('payment', 'completed') - sum('refund', 'completed'),
  }

  res.json({ success: true, data: items, meta: pageMeta(query.page, query.limit, total), summary })
}

export const adminPaymentRoutes = Router().use(requireStaff).get('/', list)
