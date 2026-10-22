import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Express } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { ADMIN_ORIGIN, STAFF, expectErrorShape, reconnect, seedStore, signIn, startApp, stopApp } from './helpers'

let app: Express

before(async () => {
  app = await startApp()
  await seedStore()
})
after(stopApp)

describe('error responses', () => {
  it('unknown routes return 404 ROUTE_NOT_FOUND with a request id', async () => {
    const res = await request(app).get('/api/nope')
    assert.equal(res.status, 404)
    expectErrorShape(res.body)
    assert.equal(res.body.code, 'ROUTE_NOT_FOUND')
    assert.equal(res.headers['x-request-id'], res.body.requestId)
  })

  it('echoes a safe incoming request id', async () => {
    const res = await request(app).get('/api/nope').set('X-Request-Id', 'trace-12345678')
    assert.equal(res.body.requestId, 'trace-12345678')
  })

  it('malformed JSON is 400 INVALID_JSON', async () => {
    const res = await request(app).post('/api/orders').set('Content-Type', 'application/json').send('{bad')
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'INVALID_JSON')
  })

  it('oversized bodies are 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app).post('/api/orders').send({ big: 'x'.repeat(1_100_000) })
    assert.equal(res.status, 413)
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE')
  })

  it('validation errors list every field', async () => {
    const res = await request(app).post('/api/orders').send({ customer: { name: 'A', phone: '123' }, items: [], paymentMethod: 'cod' })
    assert.equal(res.status, 400)
    expectErrorShape(res.body)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
    const fields = res.body.errors.map((error: { field: string }) => error.field)
    assert.ok(fields.includes('customer.name'))
    assert.ok(fields.includes('customer.phone'))
    assert.ok(fields.includes('items'))
    assert.ok(fields.includes('shippingAddress'))
  })

  it('malformed ids are 400 INVALID_ID, not a database error', async () => {
    const admin = await signIn(app)
    for (const path of ['/api/admin/products/123', '/api/admin/customers/abc', '/api/admin/orders/not-an-order', '/api/admin/stats/products/zzz']) {
      const res = await admin.get(path)
      assert.equal(res.status, 400, path)
      assert.equal(res.body.code, 'INVALID_ID', path)
      assert.doesNotMatch(res.body.message, /Cast to ObjectId/)
    }
  })

  it('a valid but unknown id is 404 NOT_FOUND', async () => {
    const admin = await signIn(app)
    const res = await admin.get(`/api/admin/products/${new mongoose.Types.ObjectId()}`)
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
  })

  it('duplicates are 409 DUPLICATE naming the field', async () => {
    const admin = await signIn(app)
    const product = { sku: 'KM-1', name: 'Copy', brand: 'B', description: 'd', price: 10, category: 'clothing', stock: 1 }
    const res = await admin.post('/api/admin/products').send(product)
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'DUPLICATE')
    assert.equal(res.body.message, 'That SKU is already in use.')
    assert.equal(res.body.errors[0].field, 'sku')
  })

  it('missing session is 401, wrong role is 403', async () => {
    const anonymous = await request(app).get('/api/admin/orders')
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.body.code, 'UNAUTHORIZED')
    const staff = await signIn(app, STAFF)
    const res = await staff.get('/api/admin/staff')
    assert.equal(res.status, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
  })

  it('writes from an unknown website are refused (CSRF defence)', async () => {
    const res = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ identifier: 'x', password: 'y' })
    assert.equal(res.status, 403)
    assert.equal(res.body.code, 'FORBIDDEN_ORIGIN')
    const allowed = await request(app).post('/api/admin/auth/login').set('Origin', ADMIN_ORIGIN).send({ email: STAFF.email, password: STAFF.password })
    assert.equal(allowed.status, 200)
  })

  it('never leaks a stack trace outside development', async () => {
    const res = await request(app).get('/api/nope')
    assert.equal(res.body.stack, undefined)
  })
})

describe('health and database outages', () => {
  it('reports healthy while the database is connected', async () => {
    const res = await request(app).get('/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.database, 'connected')
  })

  it('answers 503 SERVICE_UNAVAILABLE immediately when the database is down', async () => {
    await mongoose.disconnect()
    try {
      const started = Date.now()
      const res = await request(app).get('/api/products')
      assert.equal(res.status, 503)
      assert.equal(res.body.code, 'SERVICE_UNAVAILABLE')
      assert.ok(Date.now() - started < 3000, 'should fail fast, not wait for a timeout')
      const health = await request(app).get('/health')
      assert.equal(health.status, 503)
    } finally {
      await reconnect()
    }
  })
})
