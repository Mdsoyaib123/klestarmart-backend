import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Express } from 'express'
import request from 'supertest'
import { ADMIN, STAFF, checkoutBody, expectErrorShape, seedStore, signIn, startApp, stopApp, type Seeded } from './helpers'

let app: Express
let store: Seeded

before(async () => {
  app = await startApp()
  store = await seedStore()
})
after(stopApp)

describe('staff sign-in', () => {
  it('wrong password and unknown email give the same answer', async () => {
    const wrong = await request(app).post('/api/admin/auth/login').send({ email: ADMIN.email, password: 'nope-nope' })
    const unknown = await request(app).post('/api/admin/auth/login').send({ email: 'ghost@test.com', password: 'nope-nope' })
    for (const res of [wrong, unknown]) {
      assert.equal(res.status, 401)
      expectErrorShape(res.body)
      assert.equal(res.body.code, 'INVALID_CREDENTIALS')
      assert.equal(res.body.message, 'Incorrect login details')
    }
  })

  it('signs in, returns the profile without secrets, and sets an httpOnly cookie', async () => {
    const res = await request(app).post('/api/admin/auth/login').send(ADMIN)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.role, 'admin')
    assert.equal(res.body.data.passwordHash, undefined)
    assert.equal(res.body.data.sessionVersion, undefined)
    assert.match(String(res.headers['set-cookie']), /km_admin=.*HttpOnly/)
  })

  it('changing the password keeps this session and signs out every other one', async () => {
    const here = await signIn(app, STAFF)
    const elsewhere = await signIn(app, STAFF)
    const change = await here.put('/api/admin/auth/password').send({ currentPassword: STAFF.password, newPassword: 'new-staff-pass-1' })
    assert.equal(change.status, 200)
    assert.equal((await here.get('/api/admin/auth/me')).status, 200)
    const stale = await elsewhere.get('/api/admin/auth/me')
    assert.equal(stale.status, 401)
    // The stale cookie is cleared so the browser stops sending it.
    assert.match(String(stale.headers['set-cookie']), /km_admin=;/)
    // Restore for the other tests.
    await here.put('/api/admin/auth/password').send({ currentPassword: 'new-staff-pass-1', newPassword: STAFF.password })
  })

  it('a wrong current password is a field error', async () => {
    const admin = await signIn(app)
    const res = await admin.put('/api/admin/auth/password').send({ currentPassword: 'wrong-one', newPassword: 'whatever-123' })
    assert.equal(res.status, 400)
    assert.equal(res.body.errors[0].field, 'currentPassword')
  })

  it('an admin resetting a member password signs that member out', async () => {
    const admin = await signIn(app)
    const staff = await signIn(app, STAFF)
    const members = (await admin.get('/api/admin/staff')).body.data
    const member = members.find((user: { email: string }) => user.email === STAFF.email)
    const reset = await admin.put(`/api/admin/staff/${member.id}`).send({ name: member.name, role: 'staff', status: 'active', password: STAFF.password })
    assert.equal(reset.status, 200)
    assert.equal((await staff.get('/api/admin/auth/me')).status, 401)
  })

  it('admins cannot demote or deactivate themselves', async () => {
    const admin = await signIn(app)
    const me = (await admin.get('/api/admin/auth/me')).body.data
    const res = await admin.put(`/api/admin/staff/${me.id}`).send({ name: me.name, role: 'staff', status: 'active' })
    assert.equal(res.status, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
    assert.match(res.body.message, /another admin/)
  })

  it('deactivated staff are refused with ACCOUNT_SUSPENDED', async () => {
    const admin = await signIn(app)
    const created = await admin.post('/api/admin/staff').send({ name: 'Temp Staff', email: 'temp@test.com', role: 'staff', password: 'temp-pass-123' })
    assert.equal(created.status, 201)
    await admin.put(`/api/admin/staff/${created.body.data.id}`).send({ name: 'Temp Staff', role: 'staff', status: 'blocked' })
    const res = await request(app).post('/api/admin/auth/login').send({ email: 'temp@test.com', password: 'temp-pass-123' })
    assert.equal(res.status, 403)
    assert.equal(res.body.code, 'ACCOUNT_SUSPENDED')
  })
})

describe('customer accounts', () => {
  it('a guest who ordered can register with the same phone and sees the earlier order', async () => {
    const order = await request(app).post('/api/orders').send(checkoutBody([{ productId: store.linen.id, quantity: 1 }], '01812345678'))
    assert.equal(order.status, 201)
    const customer = request.agent(app)
    const register = await customer.post('/api/auth/register').send({ name: 'Nusrat', phone: '+880 1812-345678', password: 'secret-123' })
    assert.equal(register.status, 201)
    const mine = await customer.get('/api/account/orders')
    assert.equal(mine.body.data.length, 1)
  })

  it('registering an existing account is 409 DUPLICATE on the phone field', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Nusrat', phone: '01812345678', password: 'secret-123' })
    assert.equal(res.status, 409)
    assert.equal(res.body.errors[0].field, 'phone')
  })

  it('customers sign in by phone in any common format', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: '018 1234 5678', password: 'secret-123' })
    assert.equal(res.status, 200)
  })

  it('a customer session never opens the dashboard', async () => {
    const customer = request.agent(app)
    await customer.post('/api/auth/login').send({ identifier: '01812345678', password: 'secret-123' })
    assert.equal((await customer.get('/api/admin/orders')).status, 401)
  })

  it('blocking a customer ends their session and stops orders on that phone', async () => {
    const customer = request.agent(app)
    await customer.post('/api/auth/login').send({ identifier: '01812345678', password: 'secret-123' })
    const admin = await signIn(app)
    const found = (await admin.get('/api/admin/customers?q=01812345678')).body.data[0]
    await admin.patch(`/api/admin/customers/${found.id}/status`).send({ status: 'blocked' })
    assert.equal((await customer.get('/api/auth/me')).status, 401)
    const order = await request(app).post('/api/orders').send(checkoutBody([{ productId: store.linen.id, quantity: 1 }], '01812345678'))
    assert.equal(order.status, 403)
    assert.equal(order.body.code, 'ACCOUNT_SUSPENDED')
  })
})
