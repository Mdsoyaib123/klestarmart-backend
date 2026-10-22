import { z } from 'zod'

// The store runs on Bangladesh time (UTC+6, no daylight saving). Dates typed by people,
// like "2026-10-11", mean that day in Dhaka, not in UTC.
export const STORE_TIMEZONE = 'Asia/Dhaka'
const STORE_OFFSET = '+06:00'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/

// Parses "YYYY-MM-DD" as the start or end of that Dhaka day, a datetime without an offset as Dhaka time,
// and anything with an explicit offset or "Z" as given.
export const parseStoreDate = (value: string, edge: 'start' | 'end') => {
  // JavaScript quietly rolls "2026-02-31" over to 3 March; such dates are refused instead.
  const day = value.slice(0, 10)
  if ((DATE_ONLY.test(value) || LOCAL_DATETIME.test(value)) && !isRealDay(day)) return new Date(Number.NaN)
  if (DATE_ONLY.test(value)) return new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}${STORE_OFFSET}`)
  if (LOCAL_DATETIME.test(value)) return new Date(`${value}${STORE_OFFSET}`)
  return new Date(value)
}

const isRealDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
}

// Zod helpers for query strings and bodies: "from" dates start their day, "to" dates end it.
export const storeDate = (edge: 'start' | 'end') =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const date = parseStoreDate(value, edge)
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Use a date like 2026-10-11' })
        return z.NEVER
      }
      return date
    })

// Optional, nullable date for forms: "" and null clear the value.
export const optionalStoreDate = (edge: 'start' | 'end') =>
  z.preprocess((value) => (value === '' ? null : value instanceof Date ? value.toISOString() : value), storeDate(edge).nullable().optional())
