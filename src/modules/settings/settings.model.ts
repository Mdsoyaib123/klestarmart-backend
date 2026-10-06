import { Schema, model, type InferSchemaType } from 'mongoose'

const rateSchema = new Schema(
  {
    fee: { type: Number, required: true, min: 0 },
    minDays: { type: Number, required: true, min: 0 },
    maxDays: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

// A single document (key "site") holding everything the storefront shows that admins can change.
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'site', unique: true },
    siteName: { type: String, default: 'KlestarMart' },
    tagline: { type: String, default: 'ভালো জিনিস, Better লাইফ' },
    logoUrl: { type: String, default: '' },
    announcement: {
      enabled: { type: Boolean, default: true },
      text: { type: String, default: '' },
    },
    contact: {
      email: { type: String, default: 'support@klestarmart.com' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    social: {
      facebook: { type: String, default: '' },
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
    },
    shipping: {
      dhaka: { type: rateSchema, default: () => ({ fee: 60, minDays: 1, maxDays: 2 }) },
      outside: { type: rateSchema, default: () => ({ fee: 120, minDays: 3, maxDays: 5 }) },
      freeShippingThreshold: { type: Number, default: 3000, min: 0 },
      // Districts charged the inside-Dhaka rate.
      insideDhakaDistricts: { type: [String], default: ['Dhaka'] },
    },
    returnDays: { type: Number, default: 30, min: 0 },
    seo: {
      metaDescription: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id
        delete ret.key
        return ret
      },
    },
  },
)

export type Settings = InferSchemaType<typeof settingsSchema>
const SettingsModel = model('Settings', settingsSchema)
export default SettingsModel

// Returns the settings document, creating it with defaults on first use.
export const getSettings = () =>
  SettingsModel.findOneAndUpdate({ key: 'site' }, { $setOnInsert: { key: 'site' } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true })
