import { isValidObjectId, type SortOrder } from 'mongoose'
import { badRequest, notFound } from '@/lib/AppError'
import { pageMeta, searchRegex } from '@/lib/pagination'
import { slugify } from '@/lib/slug'
import CategoryModel from '@/modules/category/category.model'
import ProductModel from '@/modules/product/product.model'
import type { ProductInput } from '@/modules/product/product.validation'
import type { z } from 'zod'
import type { adminListQuery } from '@/modules/product/product.validation'

export const LOW_STOCK = 5

// Fields kept out of storefront responses: sales figures are business data.
const PUBLIC_PROJECTION = '-soldCount'

// Storefront: every active product. The catalogue is small enough to filter on the client.
export const listActive = () => ProductModel.find({ status: 'active' }).select(PUBLIC_PROJECTION).sort({ createdAt: -1 }).limit(1000)

export const findActive = (idOrSlug: string) =>
  ProductModel.findOne({ status: 'active', ...(isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() }) }).select(PUBLIC_PROJECTION)

export const listAdmin = async (query: z.infer<typeof adminListQuery>) => {
  const filter: Record<string, unknown> = {}
  const search = searchRegex(query.q)
  if (search) filter.$or = [{ name: search }, { sku: search }, { brand: search }]
  if (query.category) filter.category = query.category
  if (query.status) filter.status = query.status
  if (query.stock === 'out') filter.stock = 0
  if (query.stock === 'low') filter.stock = { $gt: 0, $lte: LOW_STOCK }

  const sorts: Record<typeof query.sort, Record<string, SortOrder>> = {
    newest: { createdAt: -1 },
    name: { name: 1 },
    price: { price: -1 },
    stock: { stock: 1 },
    sold: { soldCount: -1 },
  }

  const [items, total] = await Promise.all([
    ProductModel.find(filter)
      .sort(sorts[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    ProductModel.countDocuments(filter),
  ])
  return { items, meta: pageMeta(query.page, query.limit, total) }
}

// Picks a slug that no other product uses ("linen-shirt", "linen-shirt-2", ...).
const uniqueSlug = async (base: string, excludeId?: string) => {
  const root = slugify(base) || 'product'
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? root : `${root}-${attempt}`
    const taken = await ProductModel.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    if (!taken) return candidate
  }
}

const toDocument = async ({ stock, ...input }: ProductInput, excludeId?: string) => {
  if (!(await CategoryModel.exists({ slug: input.category }))) {
    throw badRequest('Choose an existing category', { code: 'VALIDATION_ERROR', errors: [{ field: 'category', message: 'This category does not exist' }] })
  }
  return {
    ...input,
    // Opening stock is set once, on create. After that, stock only changes through orders and the
    // stock-adjust endpoint; writing a number the editor loaded earlier would undo sales made since.
    ...(excludeId ? {} : { stock: stock ?? 0 }),
    slug: await uniqueSlug(input.slug ?? input.name, excludeId),
    // The first image is the main one shown on product cards.
    imageUrl: input.images[0] ?? null,
    images: input.images,
  }
}

export const create = async (input: ProductInput) => ProductModel.create(await toDocument(input))

export const update = async (id: string, input: ProductInput) => {
  if (!(await ProductModel.exists({ _id: id }))) throw notFound('Product')
  const product = await ProductModel.findByIdAndUpdate(id, await toDocument(input, id), { returnDocument: 'after', runValidators: true })
  if (!product) throw notFound('Product')
  return product
}

export const adjustStock = async (id: string, change: number) => {
  const product = await ProductModel.findOneAndUpdate(
    { _id: id, ...(change < 0 ? { stock: { $gte: -change } } : {}) },
    { $inc: { stock: change } },
    { returnDocument: 'after' },
  )
  if (product) return product
  if (!(await ProductModel.exists({ _id: id }))) throw notFound('Product')
  throw badRequest('Stock cannot go below zero', { code: 'VALIDATION_ERROR', errors: [{ field: 'change', message: 'Not enough stock to remove' }] })
}
