import assert from 'node:assert/strict'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { Express } from 'express'
import request from 'supertest'
import { STAFF, seedStore, signIn, startApp, stopApp } from './helpers'

let app: Express
const uploaded: string[] = []

before(async () => {
  app = await startApp()
  await seedStore()
})
after(async () => {
  await Promise.all(uploaded.map((file) => unlink(file).catch(() => undefined)))
  await stopApp()
})

describe('banners', () => {
  it('a date-only schedule covers whole Dhaka days', async () => {
    const admin = await signIn(app)
    const res = await admin.post('/api/admin/banners').send({ title: 'Eid sale', ctaLabel: 'Shop', ctaLink: '/shop', startsAt: '2026-10-12', endsAt: '2026-10-15' })
    assert.equal(res.status, 201)
    // Midnight 12 Oct and 23:59:59.999 on 15 Oct, Dhaka time.
    assert.equal(res.body.data.startsAt, '2026-10-11T18:00:00.000Z')
    assert.equal(res.body.data.endsAt, '2026-10-15T17:59:59.999Z')
  })

  it('the storefront only gets active banners inside their schedule', async () => {
    const admin = await signIn(app)
    await admin.post('/api/admin/banners').send({ title: 'Live now', ctaLabel: 'Shop', ctaLink: '/shop' })
    await admin.post('/api/admin/banners').send({ title: 'Hidden', ctaLabel: 'Shop', ctaLink: '/shop', isActive: false })
    const titles = (await request(app).get('/api/banners')).body.data.map((banner: { title: string }) => banner.title)
    assert.ok(titles.includes('Live now'))
    assert.ok(!titles.includes('Hidden'))
  })

  it('validates links and date order', async () => {
    const admin = await signIn(app)
    const res = await admin.post('/api/admin/banners').send({ title: 'Bad', ctaLabel: 'Go', ctaLink: 'javascript:alert(1)', startsAt: '2026-10-15', endsAt: '2026-10-12' })
    assert.equal(res.status, 400)
    const fields = res.body.errors.map((error: { field: string }) => error.field)
    assert.ok(fields.includes('ctaLink'))
    for (const ctaLink of ['//evil.example/shop', 'data:text/html,hi']) {
      const bad = await admin.post('/api/admin/banners').send({ title: 'Bad', ctaLabel: 'Go', ctaLink })
      assert.equal(bad.status, 400, ctaLink)
    }
    const image = await admin.post('/api/admin/banners').send({ title: 'Bad', ctaLabel: 'Go', ctaLink: '/shop', imageUrl: 'javascript:alert(1)' })
    assert.equal(image.status, 400)
  })
})

describe('settings', () => {
  it('only admins can change them, and district lists are cleaned', async () => {
    const admin = await signIn(app)
    const current = (await admin.get('/api/admin/settings')).body.data
    const staff = await signIn(app, STAFF)
    assert.equal((await staff.put('/api/admin/settings').send(current)).status, 403)

    const res = await admin.put('/api/admin/settings').send({ ...current, shipping: { ...current.shipping, insideDhakaDistricts: ['Dhaka', 'Gazipur', 'Dhaka'] } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.data.shipping.insideDhakaDistricts, ['Dhaka', 'Gazipur'])
    assert.deepEqual((await request(app).get('/api/settings')).body.data.shipping.insideDhakaDistricts, ['Dhaka', 'Gazipur'])
  })

  it('rejects impossible delivery windows', async () => {
    const admin = await signIn(app)
    const current = (await admin.get('/api/admin/settings')).body.data
    const res = await admin.put('/api/admin/settings').send({ ...current, shipping: { ...current.shipping, dhaka: { fee: 60, minDays: 5, maxDays: 2 } } })
    assert.equal(res.status, 400)
    assert.equal(res.body.errors[0].field, 'shipping.dhaka.maxDays')
  })
})

describe('categories', () => {
  it('a category with products cannot be deleted', async () => {
    const admin = await signIn(app)
    const clothing = (await admin.get('/api/admin/categories')).body.data[0]
    const res = await admin.delete(`/api/admin/categories/${clothing.id}`)
    assert.equal(res.status, 409)
    assert.equal(res.body.details.productCount, 3)
  })

  it('a product needs an existing category', async () => {
    const admin = await signIn(app)
    const res = await admin.post('/api/admin/products').send({ sku: 'KM-9', name: 'X', brand: 'B', description: 'd', price: 10, category: 'nope', stock: 1 })
    assert.equal(res.status, 400)
    assert.equal(res.body.errors[0].field, 'category')
  })
})

describe('uploads', () => {
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082',
    'hex',
  )

  it('stores a real image and serves it to other origins', async () => {
    const admin = await signIn(app)
    const res = await admin.post('/api/admin/uploads').attach('file', png, { filename: 'pixel.png', contentType: 'image/png' })
    assert.equal(res.status, 201)
    const name = new URL(res.body.data.url).pathname
    uploaded.push(path.resolve(process.cwd(), name.slice(1)))
    const served = await request(app).get(name)
    assert.equal(served.status, 200)
    assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin')
  })

  it('rejects a file whose content does not match its declared type', async () => {
    const admin = await signIn(app)
    const res = await admin.post('/api/admin/uploads').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' })
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'UNSUPPORTED_FILE')
  })

  it('rejects SVG and missing files', async () => {
    const admin = await signIn(app)
    const svg = await admin.post('/api/admin/uploads').attach('file', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' })
    assert.equal(svg.body.code, 'UNSUPPORTED_FILE')
    const none = await admin.post('/api/admin/uploads')
    assert.equal(none.status, 400)
  })
})
