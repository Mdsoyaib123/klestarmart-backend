import { z } from 'zod'
import { storeDate } from '@/lib/dates'
import { paginationQuery } from '@/lib/pagination'
import { optionalText, phoneSchema } from '@/lib/phone'
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/modules/order/order.model'

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    phone: phoneSchema,
    email: optionalText(z.email().trim().toLowerCase()),
  }),
  shippingAddress: z.object({
    district: z.string().trim().min(2).max(60),
    upazila: z.string().trim().min(2).max(80),
    address: z.string().trim().min(5).max(300),
    note: optionalText(z.string().trim().max(300)),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product'),
        quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100, 'At most 100 of one item per order'),
      }),
    )
    .min(1, 'Your bag is empty')
    .max(50),
  // Online payments are not connected yet.
  paymentMethod: z.literal('cod'),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>

export const orderListQuery = paginationQuery.extend({
  q: z.string().optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  // Dhaka dates: "from" starts its day, "to" ends it.
  from: storeDate('start').optional(),
  to: storeDate('end').optional(),
  user: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid customer id').optional(),
})

export const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: optionalText(z.string().trim().max(300)),
})

export const paymentRecordSchema = z.object({
  type: z.enum(['payment', 'refund']),
  method: z.enum(PAYMENT_METHODS),
  amount: z.coerce.number().positive().max(10_000_000),
  transactionId: optionalText(z.string().trim().max(80)),
  note: optionalText(z.string().trim().max(300)),
})
