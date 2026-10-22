import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Express } from 'express'
import request from 'supertest'
import { checkoutBody, seedStore, signIn, startApp, stopApp, type Seeded } from './helpers'
import OrderModel from '@/modules/order/order.model'
import ProductModel from '@/modules/product/product.model'

let app: Express
let store: Seeded

before(async () => {
  app = await startApp()
  store = await seedStore()
})
after(stopApp)

const stockOf = async (id: string) => {
  return (await ProductModel.findById(id).lean())!.stock
}

const placeOrder = async (items: { productId: string; quantity: number }[], phone?: string) => {
  const res = await request(app).post('/api/orders').send(checkoutBody(items, phone))
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.data as { id: string; orderNumber: string; total: number; subtotal: number; shippingFee: number }
}

describe('storefront catalogue', () => {
  it('hides sales figures and drafts from the public', async () => {
    const res = await request(app).get('/api/products')
    assert.equal(res.status, 200)
    assert.equal(res.body.data.length, 2)
    assert.ok(res.body.data.every((product: Record<string, unknown>) => product.soldCount === undefined))
    assert.equal((await request(app).get('/api/products/draft-hat')).status, 404)
  })

  it('finds products by slug or id', async () => {
    assert.equal((await request(app).get('/api/products/linen-shirt')).body.data.id, store.linen.id)
    assert.equal((await request(app).get(`/api/products/${store.linen.id}`)).status, 200)
  })
})

describe('checkout', () => {
  it('prices the order on the server and merges repeated lines', async () => {
    const order = await placeOrder([
      { productId: store.linen.id, quantity: 1 },
      { productId: store.linen.id, quantity: 1 },
    ])
    assert.equal(order.subtotal, 2400)
    assert.equal(order.shippingFee, 60)
    assert.match(order.orderNumber, /^KM\d{6}$/)
    assert.equal(await stockOf(store.linen.id), 98)
  })

  it('names unavailable items with ITEMS_UNAVAILABLE', async () => {
    const res = await request(app).post('/api/orders').send(checkoutBody([{ productId: store.draft.id, quantity: 1 }]))
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'ITEMS_UNAVAILABLE')
    assert.match(res.body.message, /Draft Hat/)
    assert.deepEqual(res.body.details.items, [{ productId: store.draft.id, name: 'Draft Hat' }])
  })

  it('reports every shortage at once with OUT_OF_STOCK and reserves nothing', async () => {
    const before = await stockOf(store.linen.id)
    const res = await request(app)
      .post('/api/orders')
      .send(checkoutBody([{ productId: store.linen.id, quantity: 1 }, { productId: store.tee.id, quantity: 50 }]))
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'OUT_OF_STOCK')
    assert.deepEqual(res.body.details.items, [{ productId: store.tee.id, name: 'Cotton Tee', requested: 50, available: 2 }])
    assert.equal(await stockOf(store.linen.id), before)
  })

  it('never sells the last unit twice, even under simultaneous checkouts', async () => {
    await ProductModel.updateOne({ _id: store.tee.id }, { stock: 1 })
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) => request(app).post('/api/orders').send(checkoutBody([{ productId: store.tee.id, quantity: 1 }], `0171000000${index}`))),
    )
    assert.equal(attempts.filter((res) => res.status === 201).length, 1)
    assert.ok(attempts.filter((res) => res.status !== 201).every((res) => res.body.code === 'OUT_OF_STOCK'))
    assert.equal(await stockOf(store.tee.id), 0)
    await ProductModel.updateOne({ _id: store.tee.id }, { stock: 2 })
  })
})

describe('order lifecycle', () => {
  it('refuses impossible status changes with INVALID_TRANSITION and lists the allowed ones', async () => {
    const order = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    const admin = await signIn(app)
    const res = await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'delivered' })
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'INVALID_TRANSITION')
    assert.deepEqual(res.body.details.allowed, ['confirmed', 'cancelled'])
  })

  it('finds orders by order number too', async () => {
    const order = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    const admin = await signIn(app)
    const res = await admin.get(`/api/admin/orders/${order.orderNumber}`)
    assert.equal(res.body.data.order.id, order.id)
  })

  it('cancelling the same order from several tabs at once releases stock exactly once', async () => {
    const order = await placeOrder([{ productId: store.linen.id, quantity: 2 }])
    const before = await stockOf(store.linen.id)
    const admin = await signIn(app)
    const results = await Promise.all(Array.from({ length: 5 }, () => admin.patch(`/api/admin/orders/${order.id}/status`).send({ status: 'cancelled' })))
    assert.equal(results.filter((res) => res.status === 200).length, 1)
    assert.ok(results.filter((res) => res.status !== 200).every((res) => res.status === 409))
    assert.equal(await stockOf(store.linen.id), before + 2)
  })

  it('delivering a cash-on-delivery order marks it paid', async () => {
    const order = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    const admin = await signIn(app)
    for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) {
      const res = await admin.patch(`/api/admin/orders/${order.id}/status`).send({ status })
      assert.equal(res.status, 200, status)
    }
    const detail = (await admin.get(`/api/admin/orders/${order.id}`)).body.data
    assert.equal(detail.order.paymentStatus, 'paid')
    assert.equal(detail.order.statusHistory.at(-1).by, 'Store Admin')
  })
})

describe('payments', () => {
  it('over-payment is a field error with the amount still due', async () => {
    const order = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    const admin = await signIn(app)
    const res = await admin.post(`/api/admin/orders/${order.id}/payments`).send({ type: 'payment', method: 'bkash', amount: order.total + 1 })
    assert.equal(res.status, 400)
    assert.equal(res.body.errors[0].field, 'amount')
    assert.equal(res.body.details.due, order.total)
  })

  it('simultaneous refunds can never exceed what was paid', async () => {
    const order = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    const admin = await signIn(app)
    await admin.post(`/api/admin/orders/${order.id}/payments`).send({ type: 'payment', method: 'bkash', amount: order.total, transactionId: 'TX1' })
    await Promise.all(
      Array.from({ length: 4 }, () => admin.post(`/api/admin/orders/${order.id}/payments`).send({ type: 'refund', method: 'bkash', amount: order.total })),
    )
    const detail = (await admin.get(`/api/admin/orders/${order.id}`)).body.data
    assert.equal(detail.order.amountRefunded, order.total)
    assert.equal(detail.order.paymentStatus, 'refunded')
    // The payment records themselves, not just the order's totals, must show a single refund.
    const refunds = detail.payments.filter((payment: { type: string; status: string }) => payment.type === 'refund' && payment.status === 'completed')
    assert.equal(refunds.length, 1)
  })

  it('payment history totals follow the filters', async () => {
    const admin = await signIn(app)
    const res = await admin.get('/api/admin/payments?type=refund')
    assert.equal(res.status, 200)
    assert.ok(res.body.summary.refunded > 0)
    assert.equal(res.body.summary.collected, 0)
  })
})

describe('date filters use Dhaka days', () => {
  it('"2025-03-15" covers 00:00 to 23:59 in Dhaka, not UTC', async () => {
    const early = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    const nextDay = await placeOrder([{ productId: store.linen.id, quantity: 1 }])
    // A fixed past date, so orders created "now" by other tests never fall inside it.
    // 01:00 on 15 Mar in Dhaka is 19:00 UTC on 14 Mar; 01:00 on 16 Mar in Dhaka is 19:00 UTC on 15 Mar.
    await OrderModel.collection.updateOne({ orderNumber: early.orderNumber }, { $set: { createdAt: new Date('2025-03-14T19:00:00Z') } })
    await OrderModel.collection.updateOne({ orderNumber: nextDay.orderNumber }, { $set: { createdAt: new Date('2025-03-15T19:00:00Z') } })

    const admin = await signIn(app)
    const res = await admin.get('/api/admin/orders?from=2025-03-15&to=2025-03-15')
    assert.deepEqual(res.body.data.map((order: { orderNumber: string }) => order.orderNumber), [early.orderNumber])
  })

  it('rejects dates it cannot read', async () => {
    const admin = await signIn(app)
    const res = await admin.get('/api/admin/orders?from=yesterday')
    assert.equal(res.status, 400)
    assert.equal(res.body.errors[0].field, 'from')
  })
})
