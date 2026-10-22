import { Router, type Request, type Response } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { conflict, forbidden, notFound } from '@/lib/AppError'
import { pageMeta, paginationQuery, searchRegex } from '@/lib/pagination'
import { hashPassword } from '@/lib/password'
import { created, ok } from '@/lib/respond'
import { objectIdParam, validateBody } from '@/lib/validate'
import { requireAdmin, requireStaff } from '@/middlewares/auth'
import { passwordSchema } from '@/modules/auth/auth.validation'
import OrderModel, { VOID_STATUSES } from '@/modules/order/order.model'
import UserModel from '@/modules/user/user.model'

const customerQuery = paginationQuery.extend({
  q: z.string().optional(),
  status: z.enum(['active', 'blocked']).optional(),
  // "registered" customers have a password; "guest" ones only ordered without an account.
  type: z.enum(['registered', 'guest']).optional(),
})

const statusSchema = z.object({ status: z.enum(['active', 'blocked']) })

const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase(),
  role: z.enum(['staff', 'admin']),
  password: passwordSchema,
})

const staffUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.enum(['staff', 'admin']),
  status: z.enum(['active', 'blocked']),
  password: passwordSchema.optional().or(z.literal('').transform(() => undefined)),
})

// Lifetime order count and spend per customer, excluding cancelled and returned orders.
const orderTotals = async (userIds: Types.ObjectId[]) => {
  const rows = await OrderModel.aggregate<{ _id: Types.ObjectId; orders: number; spent: number; lastOrderAt: Date }>([
    { $match: { user: { $in: userIds }, status: { $nin: VOID_STATUSES } } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' }, lastOrderAt: { $max: '$createdAt' } } },
  ])
  return new Map(rows.map((row) => [String(row._id), row]))
}

const listCustomers = async (req: Request, res: Response) => {
  const query = customerQuery.parse(req.query)
  const filter: Record<string, unknown> = { role: 'customer' }
  const search = searchRegex(query.q)
  if (search) filter.$or = [{ name: search }, { phone: search }, { email: search }]
  if (query.status) filter.status = query.status
  if (query.type) filter.passwordHash = { $exists: query.type === 'registered' }

  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select('+passwordHash'),
    UserModel.countDocuments(filter),
  ])
  const totals = await orderTotals(users.map((user) => user._id))

  ok(
    res,
    users.map((user) => {
      const stats = totals.get(String(user._id))
      return {
        ...user.toJSON(),
        registered: Boolean(user.passwordHash),
        orderCount: stats?.orders ?? 0,
        totalSpent: stats?.spent ?? 0,
        lastOrderAt: stats?.lastOrderAt,
      }
    }),
    { meta: pageMeta(query.page, query.limit, total) },
  )
}

const getCustomer = async (req: Request, res: Response) => {
  const user = await UserModel.findOne({ _id: req.params.id, role: 'customer' }).select('+passwordHash')
  if (!user) throw notFound('Customer')
  const stats = (await orderTotals([user._id])).get(String(user._id))
  ok(res, {
    ...user.toJSON(),
    registered: Boolean(user.passwordHash),
    orderCount: stats?.orders ?? 0,
    totalSpent: stats?.spent ?? 0,
    lastOrderAt: stats?.lastOrderAt,
  })
}

const setCustomerStatus = async (req: Request, res: Response) => {
  const user = await UserModel.findOneAndUpdate({ _id: req.params.id, role: 'customer' }, { status: req.body.status }, { returnDocument: 'after' })
  if (!user) throw notFound('Customer')
  ok(res, user)
}

const listStaff = async (req: Request, res: Response) => {
  ok(res, await UserModel.find({ role: { $in: ['staff', 'admin'] } }).sort({ createdAt: 1 }))
}

const createStaff = async (req: Request, res: Response) => {
  const { password, ...rest } = req.body
  const user = await UserModel.create({ ...rest, passwordHash: await hashPassword(password) })
  created(res, user)
}

const updateStaff = async (req: Request, res: Response) => {
  const user = await UserModel.findOne({ _id: req.params.id, role: { $in: ['staff', 'admin'] } }).select('+sessionVersion')
  if (!user) throw notFound('Team member')
  const { password, ...changes } = req.body

  // Admins cannot lock themselves out by accident; another admin has to do it.
  if (String(user._id) === req.user!.id && (changes.role !== user.role || changes.status !== 'active')) {
    throw forbidden('You cannot change your own role or deactivate your own account. Ask another admin.')
  }

  // Never leave the store without an active admin.
  const losesAdmin = user.role === 'admin' && (changes.role !== 'admin' || changes.status !== 'active')
  if (losesAdmin && (await UserModel.countDocuments({ role: 'admin', status: 'active', _id: { $ne: user._id } })) === 0) {
    throw conflict('You need at least one active admin.')
  }

  user.set(changes)
  if (password) {
    user.passwordHash = await hashPassword(password)
    // A new password signs the member out everywhere.
    user.sessionVersion = (user.sessionVersion ?? 0) + 1
  }
  await user.save()
  ok(res, user)
}

export const adminCustomerRoutes = Router()
  .param('id', objectIdParam)
  .use(requireStaff)
  .get('/', listCustomers)
  .get('/:id', getCustomer)
  .patch('/:id/status', validateBody(statusSchema), setCustomerStatus)

export const adminStaffRoutes = Router()
  .param('id', objectIdParam)
  .use(requireStaff, requireAdmin)
  .get('/', listStaff)
  .post('/', validateBody(staffCreateSchema), createStaff)
  .put('/:id', validateBody(staffUpdateSchema), updateStaff)
