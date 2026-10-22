import type { Response } from 'express'
import type { PageMeta } from '@/lib/pagination'

// Every successful response has the same shape: { success: true, data, meta?, ...extra }.
export const ok = (res: Response, data: unknown, extra: { meta?: PageMeta } & Record<string, unknown> = {}) => {
  res.status(200).json({ success: true, data, ...extra })
}

export const created = (res: Response, data: unknown) => {
  res.status(201).json({ success: true, data })
}
