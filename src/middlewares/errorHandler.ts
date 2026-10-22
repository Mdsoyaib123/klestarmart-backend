import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { env } from '@/config/env'
import { AppError, type FieldError } from '@/lib/AppError'
import { logger } from '@/lib/logger'

type AnyError = Error & {
  code?: number | string
  status?: number
  statusCode?: number
  type?: string
  keyValue?: Record<string, unknown>
  errors?: Record<string, { path?: string; message: string }>
  path?: string
}

// Friendly names for unique fields in "already in use" messages.
const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  slug: 'URL slug',
  email: 'email address',
  phone: 'phone number',
  orderNumber: 'order number',
}

const UPLOAD_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Images must be 5 MB or smaller',
  LIMIT_FILE_COUNT: 'Upload one image at a time',
  LIMIT_UNEXPECTED_FILE: 'Send the image in a field named "file"',
}

// Mongo errors that mean "the database is unreachable", not "your request was wrong".
const DATABASE_DOWN = ['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongooseServerSelectionError', 'MongoNotConnectedError']

const fromZod = (error: ZodError): FieldError[] =>
  error.issues.map((issue) => ({ field: issue.path.join('.') || '(body)', message: issue.message }))

// Turns any thrown value into an AppError with the right status, code and safe message.
export const normalizeError = (err: AnyError): AppError => {
  if (err instanceof AppError) return err

  if (err instanceof ZodError) {
    const errors = fromZod(err)
    const first = errors[0]
    return new AppError(400, first ? `${first.field}: ${first.message}` : 'Invalid input', { code: 'VALIDATION_ERROR', errors })
  }

  // Mongoose schema validation (a last line of defence behind the Zod schemas).
  if (err.name === 'ValidationError' && err.errors) {
    const errors = Object.values(err.errors).map((item) => ({ field: item.path ?? 'value', message: item.message }))
    return new AppError(400, errors[0]?.message ?? 'Invalid input', { code: 'VALIDATION_ERROR', errors })
  }

  if (err.name === 'CastError') {
    return new AppError(400, `Invalid value for ${err.path ?? 'a field'}`, { code: 'INVALID_ID' })
  }

  // Someone else saved the same document first (optimistic concurrency).
  if (err.name === 'VersionError') {
    return new AppError(409, 'This record was just changed by someone else. Refresh and try again.', { code: 'EDIT_CONFLICT' })
  }

  // A duplicate unique field, e.g. an email or SKU that already exists.
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0]
    const label = field ? (FIELD_LABELS[field] ?? field) : undefined
    return new AppError(409, label ? `That ${label} is already in use.` : 'A record with these values already exists.', {
      code: 'DUPLICATE',
      errors: field ? [{ field, message: `This ${label} is already in use` }] : undefined,
    })
  }

  if (err.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE'
    return new AppError(tooLarge ? 413 : 400, UPLOAD_MESSAGES[String(err.code)] ?? err.message, { code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST' })
  }

  // express.json() errors.
  if (err.type === 'entity.parse.failed') return new AppError(400, 'The request body is not valid JSON', { code: 'INVALID_JSON' })
  if (err.type === 'entity.too.large') return new AppError(413, 'The request body is too large', { code: 'PAYLOAD_TOO_LARGE' })

  if (DATABASE_DOWN.includes(err.name) || /buffering timed out|before initial connection/i.test(err.message)) {
    return new AppError(503, 'The service is temporarily unavailable. Please try again shortly.', { code: 'SERVICE_UNAVAILABLE' })
  }

  // Other middleware errors that carry an HTTP status (e.g. from http-errors).
  const status = err.status ?? err.statusCode
  if (status && status >= 400 && status < 500) return new AppError(status, err.message)

  return new AppError(500, 'Something went wrong on our side. Please try again.', { code: 'INTERNAL_ERROR' })
}

// Every error response has the same shape:
//   { success: false, code, message, errors?, details?, requestId }
export const errorHandler = (err: AnyError, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err)
    return
  }

  const error = normalizeError(err)
  const context = { requestId: req.id, method: req.method, path: req.originalUrl, status: error.status, code: error.code }

  // Unexpected failures are logged in full; expected ones (4xx) only briefly.
  if (error.status >= 500) logger.error(err.message || 'Unhandled error', { ...context, err })
  else logger.debug(error.message, context)

  if (error.status === 429 && error.details?.retryAfter) res.setHeader('Retry-After', String(error.details.retryAfter))

  res.status(error.status).json({
    success: false,
    code: error.code,
    message: error.message,
    ...(error.errors ? { errors: error.errors } : {}),
    ...(error.details ? { details: error.details } : {}),
    requestId: req.id,
    // The original stack helps during development; it never leaves the server in production.
    ...(env.nodeEnv === 'development' && error.status >= 500 ? { stack: err.stack } : {}),
  })
}
