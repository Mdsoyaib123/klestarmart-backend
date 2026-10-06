import { isValidObjectId, type Types } from 'mongoose'
import { AppError, badRequest, notFound } from '@/lib/AppError'
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
type OrderDoc = InstanceType<typeof OrderModel>

// Signed-in customers order as themselves; guests are matched to (or saved as) a customer by phone.
const resolveCustomer = async (input: CheckoutInput['customer'], userId?: string) => {
  if (userId) return userId

  const existing = await UserModel.findOne({ phone: input.phone })
  if (existing) {
    if (existing.status === 'blocked') throw new AppError(403, 'We cannot take orders for this phone number. Please contact support.')
    return existing.role === 'customer' ? String(existing._id) : undefined
  }

  const emailTaken = input.email ? await UserModel.exists({ email: input.email }) : null
  const user = await UserModel.create({
    name: input.name,
    phone: input.phone,
    ...(input.email && !emailTaken ? { email: input.email } : {}),
    role: 'customer',
  })
  return String(user._id)
}

const releaseStock = (items: { product: Types.ObjectId | string; quantity: number }[]) =>
  Promise.all(items.map(({ product, quantity }) => ProductModel.updateOne({ _id: product }, { $inc: { stock: quantity, soldCount: -quantity } })))

export const placeOrder = async (input: CheckoutInput, userId?: string) => {
  // Merge repeated lines for the same product.
  const quantities = new Map<string, number>()
  for (const { productId, quantity } of input.items) quantities.set(productId, (quantities.get(productId) ?? 0) + quantity)

  const products = await ProductModel.find({ _id: { $in: [...quantities.keys()] }, status: 'active' })
  if (products.length !== quantities.size) throw badRequest('Some items in your bag are no longer available. Please review your bag.')

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

  // Reserve stock one item at a time with a conditional update, so two shoppers can never buy the last unit twice.
  const reserved: typeof items = []
  for (const item of items) {
    const result = await ProductModel.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
    )
    if (result.modifiedCount === 0) {
      await releaseStock(reserved)
      const left = (await ProductModel.findById(item.product).select('stock').lean())?.stock ?? 0
      throw new AppError(409, left > 0 ? `Only ${left} of "${item.name}" left in stock.` : `"${item.name}" just sold out.`)
    }
    reserved.push(item)
  }

  try {
    const [settings, customerId] = await Promise.all([getSettings(), resolveCustomer(input.customer, userId)])
    const shipping = settings.shipping
    if (!shipping?.dhaka || !shipping.outside) throw new AppError(500, 'Delivery rates are not configured')
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

export const updateStatus = async (id: string, status: OrderStatus, note: string | undefined, actor: Actor) => {
  const { order } = await getOrder(id)
  const current = order.status as OrderStatus
  if (!ORDER_TRANSITIONS[current].includes(status)) {
    throw badRequest(`An order that is ${current} cannot be marked ${status}.`)
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

export const recordPayment = async (id: string, input: z.infer<typeof paymentRecordSchema>, actor: Actor) => {
  const { order } = await getOrder(id)
  const pending = await PaymentModel.find({ order: order._id, status: 'pending', type: 'payment' }).lean()
  const pendingAmount = pending.reduce((sum, p) => sum + p.amount, 0)

  if (input.type === 'payment') {
    if (order.status === 'cancelled') throw badRequest('This order is cancelled, so it cannot take payments.')
    const due = order.total - order.amountPaid
    if (input.amount > due) throw badRequest(`Only ${due} is still due on this order.`)
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
    if (input.amount > refundable) throw badRequest(`At most ${refundable} can be refunded on this order.`)
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
