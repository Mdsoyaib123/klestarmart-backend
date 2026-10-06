import { z } from 'zod'
import { optionalText, phoneSchema } from '@/lib/phone'

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128)

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: optionalText(z.email().trim().toLowerCase()),
  password: passwordSchema,
})

export const customerLoginSchema = z.object({
  // A phone number or an email address.
  identifier: z.string().trim().min(3),
  password: z.string().min(1),
})

export const staffLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: optionalText(z.email().trim().toLowerCase()),
})
