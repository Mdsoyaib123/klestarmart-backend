import { Schema, model, type InferSchemaType } from 'mongoose'

export const PRODUCT_STATUSES = ['active', 'draft', 'archived'] as const
export const BADGES = ['New', 'Sale', 'Bestseller'] as const

// Mirrors the frontend `Product` type (frontend/src/types/catalog.ts).
const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    // [label, value] pairs, e.g. ['Material', '100% linen'].
    specs: {
      type: [[String]],
      default: [],
      validate: {
        validator: (rows: string[][]) => rows.every((row) => row.length === 2),
        message: 'Each spec must be a [label, value] pair',
      },
    },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    category: { type: String, required: true, trim: true, lowercase: true, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    // Units sold across orders that were not cancelled or returned.
    soldCount: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String },
    images: { type: [String], default: undefined },
    badge: { type: String, enum: BADGES },
    // Only active products are visible in the storefront.
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active', index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      // The frontend identifies products by `id`, not Mongo's `_id`.
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id
        return ret
      },
    },
  },
)

export type Product = InferSchemaType<typeof productSchema>
export default model('Product', productSchema)
