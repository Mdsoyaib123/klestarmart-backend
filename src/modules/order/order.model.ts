import { Schema, model, type InferSchemaType } from 'mongoose'

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// Which statuses an order may move to from each status.
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
}

// Orders in these statuses do not count as sales.
export const VOID_STATUSES: OrderStatus[] = ['cancelled', 'returned']

export const PAYMENT_METHODS = ['cod', 'bkash', 'nagad', 'card', 'bank'] as const
export const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded'] as const

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    // A snapshot, so the order still reads correctly if the product changes later.
    name: { type: String, required: true },
    sku: { type: String, required: true },
    slug: { type: String },
    imageUrl: { type: String },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true, index: true },
      email: { type: String },
    },
    shippingAddress: {
      district: { type: String, required: true },
      upazila: { type: String, required: true },
      address: { type: String, required: true },
      note: { type: String },
    },
    deliveryRegion: { type: String, enum: ['dhaka', 'outside'], required: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid', index: true },
    amountPaid: { type: Number, default: 0 },
    amountRefunded: { type: Number, default: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: ORDER_STATUSES, required: true },
        note: { type: String },
        by: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id
        return ret
      },
    },
  },
)

orderSchema.index({ createdAt: -1 })

export type Order = InferSchemaType<typeof orderSchema>
export default model('Order', orderSchema)
