import { z } from 'zod'
import { httpUrl, optionalText } from '@/lib/phone'

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  description: z.string().trim().max(300).default(''),
  imageUrl: optionalText(httpUrl()).nullable(),
  highlights: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
})
