// Prepares a database for use. Safe to run more than once: existing records are left alone.
//   npm run seed
// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD (or ADMIN_NAME) when no admin exists yet,
// the site settings, and the sample categories and products.
import mongoose from 'mongoose'
import { connectDB } from '@/config/db'
import { hashPassword } from '@/lib/password'
import CategoryModel from '@/modules/category/category.model'
import ProductModel from '@/modules/product/product.model'
import { getSettings } from '@/modules/settings/settings.model'
import UserModel from '@/modules/user/user.model'
import seedData from './seed-data.json'

const seedAdmin = async () => {
  if (await UserModel.exists({ role: 'admin' })) {
    console.log('• Admin account already exists')
    return
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (!email || password.length < 8) {
    console.log('! No admin yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) in .env and run the seed again.')
    return
  }
  await UserModel.create({ name: process.env.ADMIN_NAME ?? 'Store Admin', email, role: 'admin', passwordHash: await hashPassword(password) })
  console.log(`✓ Created admin ${email}`)
}

const seedSettings = async () => {
  const settings = await getSettings()
  if (settings.announcement && !settings.announcement.text) {
    settings.announcement.text = 'Free delivery on orders over ৳3,000 · Cash on delivery available'
    await settings.save()
  }
  console.log('✓ Site settings ready')
}

const seedCatalog = async () => {
  let categories = 0
  for (const category of seedData.categories) {
    const result = await CategoryModel.updateOne({ slug: category.slug }, { $setOnInsert: category }, { upsert: true })
    categories += result.upsertedCount
  }
  let products = 0
  for (const product of seedData.products) {
    const result = await ProductModel.updateOne({ sku: product.sku }, { $setOnInsert: product }, { upsert: true })
    products += result.upsertedCount
  }
  console.log(`✓ Added ${categories} categories and ${products} products (existing ones were kept)`)
}

const run = async () => {
  await connectDB()
  await seedAdmin()
  await seedSettings()
  if (!process.argv.includes('--no-catalog')) await seedCatalog()
  await mongoose.disconnect()
}

run().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect()
  process.exit(1)
})
