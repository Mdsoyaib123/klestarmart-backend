import { Schema, model, type InferSchemaType } from 'mongoose'

export const ROLES = ['customer', 'staff', 'admin'] as const
export type Role = (typeof ROLES)[number]
export const STAFF_ROLES: Role[] = ['staff', 'admin']

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Customers sign in with phone (or email); staff sign in with email.
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    // Absent for customers created by guest checkout until they register.
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },
    lastLoginAt: { type: Date },
    // Part of every session token. Bumping it (password change, reset) signs out all existing sessions.
    sessionVersion: { type: Number, default: 0, select: false },
    defaultAddress: {
      district: String,
      upazila: String,
      address: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id
        delete ret.passwordHash
        delete ret.sessionVersion
        return ret
      },
    },
  },
)

export type User = InferSchemaType<typeof userSchema>
export default model('User', userSchema)
