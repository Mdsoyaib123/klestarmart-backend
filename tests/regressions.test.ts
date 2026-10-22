// One test per bug found in review, so none of them can come back.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Express } from 'express'
import request from 'supertest'
import { checkoutBody, seedStore, signIn, startApp, stopApp, type Seeded } from './helpers'
import OrderModel from '@/modules/order/order.model'
import PaymentModel from '@/modules/payment/payment.model'
import ProductModel from '@/modules/product/product.model'
import UserModel from '@/modules/user/user.model'

let app: Express
let store: Seeded

before(async () => {
  app = await startApp()
  store = await seedStore()
})
after(stopApp)

const order = async (items: { productId: string; quantity: number }[], phone = '01712345678') => {
  const res = await request(app).post('/api/orders').send(checkoutBody(items, phone))
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.data as { id: string; orderNumber: string; total: number }
}

describe('review fixes', () => {
  it('saving a product never overwrites stock sold since the editor loaded it', async () => {
    const admin = await signIn(app)
    const loaded = (await admin.get(`/api/admin/products/${store.linen.id}`)).body.data
    // A customer buys 2 while the editor is open.
    await order([{ productId: store.linen.id, quantity: 2 }])
    const saved = await admin.put(`/api/admin/products/${store.linen.id}`).send({ ...loaded, name: 'Linen Shirt v2' })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.data.stock, loaded.stock - 2)
    assert.equal(saved.body.data.name, 'Linen Shirt v2')
  })

  it('opening stock is still set when a product is created', async () => {
    const admin = await signIn(app)
    const res = await admin.post('/api/admin/products').send({ sku: 'KM-NEW', name: 'New Cap', brand: 'B', description: 'd', price: 500, category: 'clothing', stock: 7 })
    assert.equal(res.status, 201)
    assert.equal(res.body.data.stock, 7)
  })

  it('two simultaneous checkouts from a new guest phone both succeed with one customer record', async () => {
    const phone = '01999888777'
    const results = await Promise.all([1, 2, 3].map(() => request(app).post('/api/orders').send(checkoutBody([{ productId: store.linen.id, quantity: 1 }], phone))))
    assert.deepEqual(results.map((res) => res.status), [201, 201, 201])
    assert.equal(await UserModel.countDocuments({ phone }), 1)
  })

  it("customers do not see staff names or internal notes on their orders", async () => {
    const customer = request.agent(app)
    await customer.post('/api/auth/register').send({ name: 'Mim', phone: '01611222333', password: 'secret-123' })
    const placed = (await customer.post('/api/orders').send(checkoutBody([{ productId: store.linen.id, quantity: 1 }], '01611222333'))).body.data
    assert.equal(placed.amountPaid, undefined)
    const admin = await signIn(app)
    await admin.patch(`/api/admin/orders/${placed.id}/status`).send({ status: 'confirmed', note: 'Courier: Pathao, call before 5pm' })

    const mine = (await customer.get('/api/account/orders')).body.data[0]
    assert.deepEqual(mine.statusHistory.map((entry: { status: string }) => entry.status), ['pending', 'confirmed'])
    for (const entry of mine.statusHistory) {
      assert.equal(entry.by, undefined)
      assert.equal(entry.note, undefined)
    }
    // Staff still see everything.
    const full = (await admin.get(`/api/admin/orders/${placed.id}`)).body.data.order
    assert.equal(full.statusHistory[1].note, 'Courier: Pathao, call before 5pm')
  })

  it('overview totals match the chart: same Dhaka calendar days', async () => {
    const admin = await signIn(app)
    // An order from 7 days ago in the afternoon falls outside "last 7 days" (today and the 6 days before).
    const old = await order([{ productId: store.linen.id, quantity: 1 }])
    await OrderModel.collection.updateOne({ orderNumber: old.orderNumber }, { $set: { createdAt: new Date(Date.now() - 7 * 86_400_000) } })
    const overview = (await admin.get('/api/admin/stats/overview?days=7')).body.data
    const chartTotal = overview.series.reduce((sum: number, point: { revenue: number }) => sum + point.revenue, 0)
    assert.equal(overview.current.revenue, chartTotal)
    assert.equal(overview.series.length, 7)
  })

  it('payment history dates cash by the day it was collected, not the day of the order', async () => {
    const admin = await signIn(app)
    const placed = await order([{ productId: store.linen.id, quantity: 1 }])
    // The order (and its expected cash) was recorded long ago; the cash arrives today on delivery.
    await PaymentModel.collection.updateMany({ orderNumber: placed.orderNumber }, { $set: { createdAt: new Date('2025-03-14T19:00:00Z') } })
    for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) await admin.patch(`/api/admin/orders/${placed.id}/status`).send({ status })

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date())
    const todayRes = (await admin.get(`/api/admin/payments?from=${today}&to=${today}&q=${placed.orderNumber}`)).body
    assert.equal(todayRes.summary.collected, placed.total)
    const thenRes = (await admin.get(`/api/admin/payments?from=2025-03-15&to=2025-03-15&q=${placed.orderNumber}`)).body
    assert.equal(thenRes.summary.collected, 0)
  })

  it('returned orders cannot take payments', async () => {
    const admin = await signIn(app)
    const placed = await order([{ productId: store.linen.id, quantity: 1 }])
    for (const status of ['confirmed', 'processing', 'shipped', 'returned']) await admin.patch(`/api/admin/orders/${placed.id}/status`).send({ status })
    const res = await admin.post(`/api/admin/orders/${placed.id}/payments`).send({ type: 'payment', method: 'bkash', amount: 100 })
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'INVALID_TRANSITION')
  })

  it('repeated bag lines cannot add up past 100 of one item', async () => {
    await ProductModel.updateOne({ _id: store.linen.id }, { stock: 1000 })
    const res = await request(app).post('/api/orders').send(checkoutBody([{ productId: store.linen.id, quantity: 60 }, { productId: store.linen.id, quantity: 60 }]))
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })

  it('impossible calendar dates are refused instead of rolling over', async () => {
    const admin = await signIn(app)
    for (const date of ['2026-02-31', '2026-13-01', '2026-02-30T10:00']) {
      const res = await admin.get(`/api/admin/orders?from=${date}`)
      assert.equal(res.status, 400, date)
    }
    assert.equal((await admin.get('/api/admin/orders?from=2028-02-29')).status, 200)
  })

  it('customers can remove the email from their profile', async () => {
    const shopper = request.agent(app)
    await shopper.post('/api/auth/register').send({ name: 'Rina Akter', phone: '01812345670', email: 'rina@test.com', password: 'password-123' })
    const res = await shopper.put('/api/auth/me').send({ name: 'Rina Akter' })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.email, undefined)
    assert.equal((await UserModel.findById(res.body.data.id).lean())?.email, undefined)
  })

  it('orders are indexed by product for sales stats', async () => {
    const indexes = await OrderModel.collection.indexes()
    assert.ok(indexes.some((index) => 'items.product' in index.key))
  })
})
