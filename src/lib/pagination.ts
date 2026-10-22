import { z } from 'zod'

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export interface PageMeta {
  page: number
  limit: number
  total: number
  pages: number
}

export const pageMeta = (page: number, limit: number, total: number): PageMeta => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
})

// Escapes user input for use inside a RegExp search.
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Case-insensitive "contains" match, capped in length so a search cannot become an expensive pattern.
export const searchRegex = (value?: string) => {
  const term = value?.trim().slice(0, 100)
  return term ? new RegExp(escapeRegex(term), 'i') : undefined
}
