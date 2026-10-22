import { z } from 'zod'
import { httpUrl } from '@/lib/phone'

const url = z.union([httpUrl(), z.literal('')])
const rate = z
  .object({
    fee: z.coerce.number().min(0).max(100_000),
    minDays: z.coerce.number().int().min(0).max(60),
    maxDays: z.coerce.number().int().min(0).max(60),
  })
  .refine((value) => value.maxDays >= value.minDays, { message: 'Max days must be at least min days', path: ['maxDays'] })

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(120),
  logoUrl: url,
  announcement: z.object({ enabled: z.boolean(), text: z.string().trim().max(200) }),
  contact: z.object({
    email: z.union([z.email(), z.literal('')]),
    phone: z.string().trim().max(30),
    address: z.string().trim().max(300),
  }),
  social: z.object({ facebook: url, instagram: url, youtube: url }),
  shipping: z.object({
    dhaka: rate,
    outside: rate,
    freeShippingThreshold: z.coerce.number().min(0).max(10_000_000),
    // Deduplicated, so a district typed twice is stored once.
    insideDhakaDistricts: z
      .array(z.string().trim().min(1).max(40))
      .min(1, 'List at least one district')
      .max(64)
      .transform((list) => [...new Set(list)]),
  }),
  returnDays: z.coerce.number().int().min(0).max(365),
  seo: z.object({ metaDescription: z.string().trim().max(300) }),
})
