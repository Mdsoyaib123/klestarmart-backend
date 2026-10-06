import { z } from 'zod'
import { optionalText } from '@/lib/phone'
import { paginationQuery } from '@/lib/pagination'
import { BADGES, PRODUCT_STATUSES } from '@/modules/product/product.model'

const money = z.coerce.number().min(0).max(10_000_000)

export const productSchema = z
  .object({
    sku: z.string().trim().min(1).max(40),
    slug: optionalText(z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')),
    name: z.string().trim().min(1).max(160),
    brand: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(5000),
    specs: z.array(z.tuple([z.string().trim().min(1).max(60), z.string().trim().max(200)])).max(30).default([]),
    price: money,
    compareAtPrice: money.nullable().optional(),
    category: z.string().trim().toLowerCase().min(1),
    stock: z.coerce.number().int().min(0),
    images: z.array(z.url()).max(10).default([]),
    badge: z.enum(BADGES).nullable().optional(),
    status: z.enum(PRODUCT_STATUSES).default('active'),
  })
  .refine((value) => value.compareAtPrice == null || value.compareAtPrice > value.price, {
    message: 'Compare-at price must be higher than the price',
    path: ['compareAtPrice'],
  })

export type ProductInput = z.infer<typeof productSchema>

export const adminListQuery = paginationQuery.extend({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  stock: z.enum(['low', 'out']).optional(),
  sort: z.enum(['newest', 'name', 'price', 'stock', 'sold']).default('newest'),
})

export const stockAdjustSchema = z.object({
  // Positive to add stock, negative to remove it.
  change: z.coerce.number().int().refine((value) => value !== 0, 'Change cannot be zero'),
})
