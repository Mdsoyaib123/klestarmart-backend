import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { storeDate } from '@/lib/dates'
import { pageMeta, paginationQuery, searchRegex } from '@/lib/pagination'
import { ok } from '@/lib/respond'
import { requireStaff } from '@/middlewares/auth'
import { PAYMENT_METHODS } from '@/modules/order/order.model'
import PaymentModel from '@/modules/payment/payment.model'

const listQuery = paginationQuery.extend({
  q: z.string().optional(),
  type: z.enum(['payment', 'refund']).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  // Dhaka dates: "from" starts its day, "to" ends it.
  from: storeDate('start').optional(),
  to: storeDate('end').optional(),
})

// Payment history, with totals for the whole filtered range (not just the current page).
const list = async (req: Request, res: Response) => {
  const query = listQuery.parse(req.query)
  const conditions: Record<string, unknown>[] = []
  const search = searchRegex(query.q)
  if (search) conditions.push({ $or: [{ orderNumber: search }, { customerName: search }, { transactionId: search }] })
  if (query.type) conditions.push({ type: query.type })
  if (query.method) conditions.push({ method: query.method })
  if (query.status) conditions.push({ status: query.status })
  if (query.from || query.to) {
    const range = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) }
    // A payment belongs to the day the money moved: completed ones by completedAt (cash collected on
    // delivery, possibly days after the order), the rest (pending, void) by when they were recorded.
    conditions.push({ $or: [{ completedAt: range }, { completedAt: null, createdAt: range }] })
  }
  const filter = conditions.length ? { $and: conditions } : {}

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

  ok(res, items, { meta: pageMeta(query.page, query.limit, total), summary })
}

export const adminPaymentRoutes = Router().use(requireStaff).get('/', list)
