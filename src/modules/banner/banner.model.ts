import { Schema, model, type InferSchemaType } from 'mongoose'

export const BANNER_THEMES = ['light', 'dark', 'accent'] as const

// A slide in the storefront's home page hero carousel.
const bannerSchema = new Schema(
  {
    eyebrow: { type: String, default: '' },
    title: { type: String, required: true, trim: true },
    text: { type: String, default: '' },
    imageUrl: { type: String },
    ctaLabel: { type: String, default: 'Shop now' },
    ctaLink: { type: String, default: '/shop' },
    secondaryLabel: { type: String, default: '' },
    secondaryLink: { type: String, default: '' },
    theme: { type: String, enum: BANNER_THEMES, default: 'light' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Optional schedule; outside it the banner is hidden.
    startsAt: { type: Date },
    endsAt: { type: Date },
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

export type Banner = InferSchemaType<typeof bannerSchema>
export default model('Banner', bannerSchema)
