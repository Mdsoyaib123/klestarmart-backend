// Shared test setup: an in-memory MongoDB, the app, and a small seeded store.
import { ADMIN_ORIGIN, STORE_ORIGIN } from './setup-env'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '@/app'
import { connectDB } from '@/config/db'
import { hashPassword } from '@/lib/password'
import CategoryModel from '@/modules/category/category.model'
import ProductModel from '@/modules/product/product.model'
import UserModel from '@/modules/user/user.model'

export { ADMIN_ORIGIN, STORE_ORIGIN }
export const ADMIN = { email: 'admin@test.com', password: 'admin-pass-123' }
export const STAFF = { email: 'staff@test.com', password: 'staff-pass-123' }

let mongo: MongoMemoryServer | undefined

export const startApp = async (): Promise<Express> => {
  mongo = await MongoMemoryServer.create()
  await connectDB(mongo.getUri('klestar-test'))
  return app
}

export const stopApp = async () => {
  await mongoose.disconnect()
  await mongo?.stop()
}

export const reconnect = () => connectDB(mongo!.getUri('klestar-test'))

export interface Seeded {
  linen: { id: string; price: number }
  tee: { id: string; price: number }
  draft: { id: string; name: string }
}

// One admin, one staff member, a category, two active products and a draft one.
export const seedStore = async (): Promise<Seeded> => {
  await UserModel.create([
    { name: 'Store Admin', email: ADMIN.email, role: 'admin', passwordHash: await hashPassword(ADMIN.password) },
    { name: 'Shop Staff', email: STAFF.email, role: 'staff', passwordHash: await hashPassword(STAFF.password) },
  ])
  await CategoryModel.create({ slug: 'clothing', name: 'Clothing' })
  const base = { brand: 'Alder', description: 'A test product', category: 'clothing' }
  const [linen, tee, draft] = await ProductModel.create([
    { ...base, sku: 'KM-1', slug: 'linen-shirt', name: 'Linen Shirt', price: 1200, stock: 100 },
    { ...base, sku: 'KM-2', slug: 'cotton-tee', name: 'Cotton Tee', price: 700, stock: 2 },
    { ...base, sku: 'KM-3', slug: 'draft-hat', name: 'Draft Hat', price: 300, stock: 9, status: 'draft' },
  ])
  return {
    linen: { id: String(linen._id), price: 1200 },
    tee: { id: String(tee._id), price: 700 },
    draft: { id: String(draft._id), name: 'Draft Hat' },
  }
}

// A cookie-keeping client signed in to the dashboard.
export const signIn = async (app: Express, user = ADMIN) => {
  const agent = request.agent(app)
  const res = await agent.post('/api/admin/auth/login').send(user)
  if (res.status !== 200) throw new Error(`Sign-in failed: ${res.status} ${JSON.stringify(res.body)}`)
  return agent
}

export const checkoutBody = (items: { productId: string; quantity: number }[], phone = '01712345678', district = 'Dhaka') => ({
  customer: { name: 'Rahim Uddin', phone },
  shippingAddress: { district, upazila: 'Dhanmondi', address: 'House 12, Road 5' },
  items,
  paymentMethod: 'cod',
})

// Every error response has this shape.
export const expectErrorShape = (body: Record<string, unknown>) => {
  if (body.success !== false || typeof body.code !== 'string' || typeof body.message !== 'string' || typeof body.requestId !== 'string') {
    throw new Error(`Not a standard error body: ${JSON.stringify(body)}`)
  }
}
