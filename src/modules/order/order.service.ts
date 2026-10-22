import { isValidObjectId, type Types } from 'mongoose'
import { AppError, badRequest, conflict, forbidden, notFound } from '@/lib/AppError'
import { nextSequence } from '@/lib/counter'
import { pageMeta, searchRegex } from '@/lib/pagination'
import OrderModel, { ORDER_TRANSITIONS, type OrderStatus } from '@/modules/order/order.model'
import PaymentModel from '@/modules/payment/payment.model'
import ProductModel from '@/modules/product/product.model'
import { getSettings } from '@/modules/settings/settings.model'
import UserModel from '@/modules/user/user.model'
import type { CheckoutInput, orderListQuery, paymentRecordSchema } from '@/modules/order/order.validation'
import type { z } from 'zod'

type Actor = { name: string }

export const MAX_PER_ITEM = 100
type OrderDoc = InstanceType<typeof OrderModel>

// Signed-in customers order as themselves; guests are matched to (or saved as) a customer by phone.
const resolveCustomer = async (input: CheckoutInput['customer'], userId?: string) => {
  if (userId) return userId

  // Find-or-create in one atomic step, so two checkouts at once (a double click, a retry) with a new
  // phone number cannot both try to create the customer and trip the unique-phone rule.
  const emailTaken = input.email ? await UserModel.exists({ email: input.email }) : null
  const create = { name: input.name, role: 'customer', ...(input.email && !emailTaken ? { email: input.email } : {}) }
  let user
  try {
    user = await UserModel.findOneAndUpdate({ phone: input.phone }, { $setOnInsert: create }, { upsert: true, returnDocument: 'after' })
  } catch (error) {
    // The email was claimed by someone else in the meantime: create the customer without it.
    if ((error as { code?: number }).code !== 11000) throw error
    user = await UserModel.findOneAndUpdate({ phone: input.phone }, { $setOnInsert: { name: input.name, role: 'customer' } }, { upsert: true, returnDocument: 'after' })
  }
  if (user.status === 'blocked') throw forbidden('We cannot take orders for this phone number. Please contact support.', { code: 'ACCOUNT_SUSPENDED' })
  return user.role === 'customer' ? String(user._id) : undefined
}

// What a customer may see of their own orders: no staff names or internal notes from the timeline.
export const CUSTOMER_ORDER_PROJECTION = '-statusHistory.by -statusHistory.note -amountPaid -amountRefunded'

const releaseStock = (items: { product: Types.ObjectId | string; quantity: number }[]) =>
  Promise.all(items.map(({ product, quantity }) => ProductModel.updateOne({ _id: product }, { $inc: { stock: quantity, soldCount: -quantity } })))

interface StockProblem {
  productId: string
  name: string
  requested: number
  available: number
}

const outOfStock = (problems: StockProblem[]) => {
  const message =
    problems.length === 1
      ? problems[0].available > 0
        ? `Only ${problems[0].available} of "${problems[0].name}" left in stock.`
        : `"${problems[0].name}" just sold out.`
      : `Some items do not have enough stock: ${problems.map((item) => `"${item.name}" (${item.available} left)`).join(', ')}.`
  return conflict(message, { code: 'OUT_OF_STOCK', details: { items: problems } })
}

export const placeOrder = async (input: CheckoutInput, userId?: string) => {
  // Merge repeated lines for the same product.
  const quantities = new Map<string, number>()
  for (const { productId, quantity } of input.items) quantities.set(productId, (quantities.get(productId) ?? 0) + quantity)
  const ids = [...quantities.keys()]
  const overLimit = ids.find((id) => quantities.get(id)! > MAX_PER_ITEM)
  if (overLimit) {
    throw badRequest(`At most ${MAX_PER_ITEM} of one item per order`, {
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'items', message: `At most ${MAX_PER_ITEM} of one item per order` }],
      details: { productId: overLimit },
    })
  }

  // Items that were deleted, drafted or archived since they went into the bag are reported together,
  // with names where we still have them, so the shopper knows exactly what to remove.
  const products = await ProductModel.find({ _id: { $in: ids }, status: 'active' })
  if (products.length !== ids.length) {
    const found = new Set(products.map((product) => String(product._id)))
    const missingIds = ids.filter((id) => !found.has(id))
    const known = await ProductModel.find({ _id: { $in: missingIds } }).select('name').lean()
    const names = new Map(known.map((product) => [String(product._id), product.name]))
    const items = missingIds.map((productId) => ({ productId, name: names.get(productId) ?? null }))
    const named = items.map((item) => item.name).filter(Boolean)
    throw conflict(
      named.length ? `No longer available: ${named.map((name) => `"${name}"`).join(', ')}. Remove it from your bag to continue.` : 'Some items in your bag are no longer available. Please review your bag.',
      { code: 'ITEMS_UNAVAILABLE', details: { items } },
    )
  }

  // Prices always come from the database, never from the client.
  const items = products.map((product) => ({
    product: product._id,
    name: product.name,
    sku: product.sku,
    slug: product.slug,
    imageUrl: product.imageUrl ?? undefined,
    price: product.price,
    quantity: quantities.get(String(product._id))!,
  }))

  // Report every shortage at once before reserving anything.
  const shortages = products
    .filter((product) => product.stock < quantities.get(String(product._id))!)
    .map((product) => ({ productId: String(product._id), name: product.name, requested: quantities.get(String(product._id))!, available: product.stock }))
  if (shortages.length) throw outOfStock(shortages)

  // Reserve stock one item at a time with a conditional update, so two shoppers can never buy the last unit twice.
  const reserved: typeof items = []
  for (const item of items) {
    const result = await ProductModel.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
    )
    if (result.modifiedCount === 0) {
      // Someone bought it between the check above and now.
      await releaseStock(reserved)
      const available = (await ProductModel.findById(item.product).select('stock').lean())?.stock ?? 0
      throw outOfStock([{ productId: String(item.product), name: item.name, requested: item.quantity, available }])
    }
    reserved.push(item)
  }

  try {
    const [settings, customerId] = await Promise.all([getSettings(), resolveCustomer(input.customer, userId)])
    const shipping = settings.shipping
    if (!shipping?.dhaka || !shipping.outside) throw new AppError(503, 'Delivery rates are not configured yet', { code: 'SERVICE_UNAVAILABLE' })
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const deliveryRegion = shipping.insideDhakaDistricts.includes(input.shippingAddress.district) ? 'dhaka' : 'outside'
    const shippingFee = subtotal >= shipping.freeShippingThreshold ? 0 : shipping[deliveryRegion].fee

    const order = await OrderModel.create({
      orderNumber: `KM${100000 + (await nextSequence('order'))}`,
      user: customerId,
      customer: input.customer,
      shippingAddress: input.shippingAddress,
      deliveryRegion,
      items,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      paymentMethod: input.paymentMethod,
      statusHistory: [{ status: 'pending', note: 'Order placed', by: input.customer.name }],
    })

    // Cash on delivery is expected, so it is recorded now and completed on delivery.
    await PaymentModel.create({
      order: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name ?? input.customer.name,
      method: order.paymentMethod,
      amount: order.total,
      status: 'pending',
      note: 'Cash to collect on delivery',
    })

    return order
  } catch (error) {
    await releaseStock(reserved)
    throw error
  }
}

export const listOrders = async (query: z.infer<typeof orderListQuery>) => {
  const filter: Record<string, unknown> = {}
  const search = searchRegex(query.q)
  if (search) filter.$or = [{ orderNumber: search }, { 'customer.name': search }, { 'customer.phone': search }]
  if (query.status) filter.status = query.status
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus
  if (query.user) filter.user = query.user
  if (query.from || query.to) {
    filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) }
  }

  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    OrderModel.countDocuments(filter),
  ])
  return { items, meta: pageMeta(query.page, query.limit, total) }
}

export const getOrder = async (id: string) => {
  const order = isValidObjectId(id) ? await OrderModel.findById(id) : await OrderModel.findOne({ orderNumber: id })
  if (!order) throw notFound('Order')
  const payments = await PaymentModel.find({ order: order._id }).sort({ createdAt: 1 })
  return { order, payments }
}

// A crashed request's lock is ignored after this long.
const LOCK_MS = 15_000

// Runs a status change or payment on one order at a time. Each one checks limits against the order's
// totals and only updates them at the end, so a second request arriving in between would check against
// stale totals (and, say, refund the same money twice). It gets an edit conflict instead.
const withOrderLock = async <T>(id: string, work: () => Promise<T>) => {
  const filter = isValidObjectId(id) ? { _id: id } : { orderNumber: id }
  const now = new Date()
  const claimed = await OrderModel.findOneAndUpdate(
    { ...filter, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
    { projection: { _id: 1 } },
  )
  if (!claimed) {
    if (!(await OrderModel.exists(filter))) throw notFound('Order')
    throw conflict('Someone else is updating this order right now. Refresh and try again.', { code: 'EDIT_CONFLICT' })
  }
  try {
    return await work()
  } finally {
    await OrderModel.updateOne({ _id: claimed._id }, { $unset: { lockedUntil: 1 } })
  }
}

// Recalculates the order's payment totals from its completed payment records.
const refreshPaymentStatus = async (order: OrderDoc) => {
  const payments = await PaymentModel.find({ order: order._id, status: 'completed' }).lean()
  const paid = payments.filter((p) => p.type === 'payment').reduce((sum, p) => sum + p.amount, 0)
  const refunded = payments.filter((p) => p.type === 'refund').reduce((sum, p) => sum + p.amount, 0)
  order.amountPaid = paid
  order.amountRefunded = refunded
  order.paymentStatus =
    refunded > 0 && refunded >= paid ? 'refunded'
      : refunded > 0 ? 'partially_refunded'
        : paid >= order.total ? 'paid'
          : paid > 0 ? 'partially_paid'
            : 'unpaid'
  await order.save()
}

const applyStatus = async (id: string, status: OrderStatus, note: string | undefined, actor: Actor) => {
  const { order } = await getOrder(id)
  const current = order.status as OrderStatus
  if (!ORDER_TRANSITIONS[current].includes(status)) {
    throw conflict(`An order that is ${current} cannot be marked ${status}.`, {
      code: 'INVALID_TRANSITION',
      details: { current, requested: status, allowed: ORDER_TRANSITIONS[current] },
    })
  }

  order.status = status
  order.statusHistory.push({ status, note, by: actor.name, at: new Date() })
  await order.save()

  if (status === 'cancelled' || status === 'returned') {
    await releaseStock(order.items)
    // Cash that was never collected is voided.
    await PaymentModel.updateMany({ order: order._id, status: 'pending' }, { status: 'failed', note: `Order ${status}` })
  }
  if (status === 'delivered') {
    // Delivering a cash-on-delivery order means the rider collected the cash.
    await PaymentModel.updateMany(
      { order: order._id, status: 'pending', type: 'payment' },
      { status: 'completed', completedAt: new Date(), recordedBy: actor.name, note: 'Collected on delivery' },
    )
  }
  await refreshPaymentStatus(order)
  return getOrder(String(order._id))
}

const applyPayment = async (id: string, input: z.infer<typeof paymentRecordSchema>, actor: Actor) => {
  const { order } = await getOrder(id)
  const pending = await PaymentModel.find({ order: order._id, status: 'pending', type: 'payment' }).lean()
  const pendingAmount = pending.reduce((sum, p) => sum + p.amount, 0)

  if (input.type === 'payment') {
    if (order.status === 'cancelled' || order.status === 'returned') {
      throw conflict(`This order is ${order.status}, so it cannot take payments.`, { code: 'INVALID_TRANSITION' })
    }
    const due = order.total - order.amountPaid
    if (input.amount > due) {
      throw badRequest(due > 0 ? `Only ${due} is still due on this order.` : 'This order is already paid in full.', {
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'amount', message: `At most ${due}` }],
        details: { due },
      })
    }
    // A manual payment reduces the cash still expected on delivery by the amount it covers.
    if (pendingAmount > 0) {
      const stillExpected = due - input.amount
      await PaymentModel.updateMany({ order: order._id, status: 'pending', type: 'payment' }, { status: 'failed', note: 'Paid another way' })
      if (stillExpected > 0) {
        await PaymentModel.create({
          order: order._id,
          orderNumber: order.orderNumber,
          customerName: order.customer?.name ?? 'Customer',
          method: 'cod',
          amount: stillExpected,
          status: 'pending',
          note: 'Remaining cash to collect on delivery',
        })
      }
    }
  } else {
    const refundable = order.amountPaid - order.amountRefunded
    if (input.amount > refundable) {
      throw badRequest(refundable > 0 ? `At most ${refundable} can be refunded on this order.` : 'Nothing has been paid on this order, so there is nothing to refund.', {
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'amount', message: `At most ${refundable}` }],
        details: { refundable },
      })
    }
  }

  await PaymentModel.create({
    ...input,
    order: order._id,
    orderNumber: order.orderNumber,
    customerName: order.customer?.name ?? 'Customer',
    status: 'completed',
    completedAt: new Date(),
    recordedBy: actor.name,
  })
  await refreshPaymentStatus(order)
  return getOrder(String(order._id))
}

export const updateStatus = (id: string, status: OrderStatus, note: string | undefined, actor: Actor) =>
  withOrderLock(id, () => applyStatus(id, status, note, actor))

export const recordPayment = (id: string, input: z.infer<typeof paymentRecordSchema>, actor: Actor) =>
  withOrderLock(id, () => applyPayment(id, input, actor))
