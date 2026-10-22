import { Router, type Request, type Response } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { notFound } from '@/lib/AppError'
import { STORE_TIMEZONE, parseStoreDate } from '@/lib/dates'
import { ok } from '@/lib/respond'
import { objectIdParam } from '@/lib/validate'
import { requireStaff } from '@/middlewares/auth'
import OrderModel, { VOID_STATUSES } from '@/modules/order/order.model'
import ProductModel from '@/modules/product/product.model'
import { LOW_STOCK } from '@/modules/product/product.service'
import UserModel from '@/modules/user/user.model'

const DAY_MS = 86_400_000
// Daily buckets use Bangladesh time, so "today" matches the store's day.
const TIMEZONE = STORE_TIMEZONE

const rangeQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })

const salesMatch = (from: Date, to: Date) => ({ createdAt: { $gte: from, $lt: to }, status: { $nin: VOID_STATUSES } })

// "Last N days" means today plus the N-1 days before it, as Dhaka calendar days, so the totals cover
// exactly the days the chart shows. Dhaka has no daylight saving, so a day is always 24 hours.
const periodStart = (days: number, now = new Date()) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now)
  return new Date(parseStoreDate(today, 'start').getTime() - (days - 1) * DAY_MS)
}

const totalsBetween = async (from: Date, to: Date) => {
  const [row] = await OrderModel.aggregate<{ revenue: number; orders: number; units: number }>([
    { $match: salesMatch(from, to) },
    { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 }, units: { $sum: { $sum: '$items.quantity' } } } },
  ])
  const customers = await UserModel.countDocuments({ role: 'customer', createdAt: { $gte: from, $lt: to } })
  const revenue = row?.revenue ?? 0
  const orders = row?.orders ?? 0
  return { revenue, orders, units: row?.units ?? 0, averageOrder: orders ? Math.round(revenue / orders) : 0, newCustomers: customers }
}

// Fills missing days with zeros so the chart has one point per day.
const dailySeries = async (match: Record<string, unknown>, days: number, unitsOnly = false) => {
  const rows = await OrderModel.aggregate<{ _id: string; revenue: number; orders: number; units: number }>([
    { $match: match },
    ...(unitsOnly ? [{ $unwind: '$items' }, { $match: { 'items.product': match['items.product'] } }] : []),
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } },
        revenue: { $sum: unitsOnly ? { $multiply: ['$items.price', '$items.quantity'] } : '$total' },
        orders: { $sum: 1 },
        units: { $sum: unitsOnly ? '$items.quantity' : { $sum: '$items.quantity' } },
      },
    },
  ])
  const byDay = new Map(rows.map((row) => [row._id, row]))
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE })
  // Oldest first, ending with today; the same days periodStart() covers.
  const start = periodStart(days)
  return Array.from({ length: days }, (_, index) => {
    const date = formatter.format(new Date(start.getTime() + index * DAY_MS))
    const row = byDay.get(date)
    return { date, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0, units: row?.units ?? 0 }
  })
}

const overview = async (req: Request, res: Response) => {
  const { days } = rangeQuery.parse(req.query)
  const to = new Date()
  const from = periodStart(days, to)
  // The same number of whole days just before.
  const previousFrom = new Date(from.getTime() - days * DAY_MS)

  const [current, previous, series, byStatus, topProducts, paymentMethods, lowStock, recentOrders, pendingOrders] = await Promise.all([
    totalsBetween(from, to),
    totalsBetween(previousFrom, from),
    dailySeries(salesMatch(from, to), days),
    OrderModel.aggregate<{ _id: string; count: number }>([{ $match: { createdAt: { $gte: from, $lt: to } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    OrderModel.aggregate([
      { $match: salesMatch(from, to) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          imageUrl: { $first: '$items.imageUrl' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]),
    OrderModel.aggregate<{ _id: string; count: number; amount: number }>([
      { $match: salesMatch(from, to) },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: '$total' } } },
    ]),
    ProductModel.find({ status: 'active', stock: { $lte: LOW_STOCK } }).sort({ stock: 1 }).limit(8).select('name sku stock imageUrl'),
    OrderModel.find().sort({ createdAt: -1 }).limit(6).select('orderNumber customer total status paymentStatus createdAt'),
    OrderModel.countDocuments({ status: 'pending' }),
  ])

  ok(res, {
    days,
    current,
    previous,
    series,
    pendingOrders,
    ordersByStatus: Object.fromEntries(byStatus.map((row) => [row._id, row.count])),
    topProducts: topProducts.map(({ _id, ...row }) => ({ productId: String(_id), ...row })),
    paymentMethods: paymentMethods.map((row) => ({ method: row._id, count: row.count, amount: row.amount })),
    lowStock,
    recentOrders,
  })
}

// Sales figures for one product: lifetime totals and a daily series for the range.
const productStats = async (req: Request, res: Response) => {
  const { days } = rangeQuery.parse(req.query)
  const id = String(req.params.id)
  if (!(await ProductModel.exists({ _id: id }))) throw notFound('Product')
  const productId = new Types.ObjectId(id)
  const from = periodStart(days)

  const [lifetime] = await OrderModel.aggregate<{ units: number; revenue: number; orders: number }>([
    { $match: { 'items.product': productId, status: { $nin: VOID_STATUSES } } },
    { $unwind: '$items' },
    { $match: { 'items.product': productId } },
    { $group: { _id: null, units: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }, orders: { $sum: 1 } } },
  ])
  const series = await dailySeries({ 'items.product': productId, ...salesMatch(from, new Date()) }, days, true)

  ok(res, { days, lifetime: { units: lifetime?.units ?? 0, revenue: lifetime?.revenue ?? 0, orders: lifetime?.orders ?? 0 }, series })
}

export const adminStatsRoutes = Router().param('id', objectIdParam).use(requireStaff).get('/overview', overview).get('/products/:id', productStats)
