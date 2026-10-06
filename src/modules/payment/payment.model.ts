import { Schema, model, type InferSchemaType } from 'mongoose'
import { PAYMENT_METHODS } from '@/modules/order/order.model'

// One money movement against an order: a payment received or a refund given.
const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    customerName: { type: String, required: true },
    type: { type: String, enum: ['payment', 'refund'], default: 'payment' },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    // Cash on delivery stays pending until the order is delivered.
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed', index: true },
    transactionId: { type: String, trim: true },
    note: { type: String, trim: true },
    recordedBy: { type: String },
    completedAt: { type: Date },
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

paymentSchema.index({ createdAt: -1 })

export type Payment = InferSchemaType<typeof paymentSchema>
export default model('Payment', paymentSchema)
