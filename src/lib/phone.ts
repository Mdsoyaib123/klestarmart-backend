import { z } from 'zod'

// Normalises Bangladesh mobile numbers ("+880 1712-345678" -> "01712345678").
export const normalizePhone = (value: string) => {
  const digits = value.replace(/[^\d+]/g, '')
  if (digits.startsWith('+880')) return `0${digits.slice(4)}`
  if (digits.startsWith('880')) return `0${digits.slice(3)}`
  return digits
}

export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((value) => /^01[3-9]\d{8}$/.test(value), 'Enter a valid 11-digit Bangladesh mobile number')

// Optional text fields: blank strings become undefined so sparse unique indexes keep working.
export const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional())
