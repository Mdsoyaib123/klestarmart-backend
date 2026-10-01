import { Schema, model, type InferSchemaType } from 'mongoose'

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    category: { type: String, required: true },
    imageUrl: { type: String },
  },
  { timestamps: true },
)

export type Product = InferSchemaType<typeof productSchema>
export default model('Product', productSchema)
