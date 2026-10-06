import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { env } from '@/config/env'
import { AppError } from '@/lib/AppError'

type HttpError = Error & { code?: number | string; status?: number; statusCode?: number }

const UPLOAD_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Images must be 5 MB or smaller',
  LIMIT_FILE_COUNT: 'Upload one image at a time',
  LIMIT_UNEXPECTED_FILE: 'Send the image in a field named "file"',
}

export const errorHandler = (err: HttpError, req: Request, res: Response, next: NextFunction) => {
  // Invalid input: report each problem by field so forms can show it.
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    res.status(400).json({
      success: false,
      message: issues[0] ? `${issues[0].path ? `${issues[0].path}: ` : ''}${issues[0].message}` : 'Invalid input',
      issues,
    })
    return
  }

  if (err.name === 'MulterError') {
    res.status(400).json({ success: false, message: UPLOAD_MESSAGES[String(err.code)] ?? err.message })
    return
  }

  // A duplicate unique field, e.g. an email or SKU that already exists.
  if (err.code === 11000) {
    const field = Object.keys((err as HttpError & { keyValue?: object }).keyValue ?? {})[0]
    res.status(409).json({ success: false, message: field ? `That ${field} is already in use.` : 'A record with these values already exists.' })
    return
  }

  const isInputError = err.name === 'ValidationError' || err.name === 'CastError'
  // Errors raised by middleware such as express.json() carry their own status (400 bad JSON, 413 too large).
  const ownStatus = err instanceof AppError ? err.status : (err.status ?? err.statusCode)
  const statusCode = isInputError
    ? 400
    : ownStatus && ownStatus >= 400 && ownStatus < 600
      ? ownStatus
      : res.statusCode >= 400
        ? res.statusCode
        : 500
  const message = statusCode >= 500 && env.isProduction ? 'Internal server error' : err.message

  if (statusCode >= 500) console.error(err)

  res.status(statusCode).json({
    success: false,
    message,
    stack: env.isProduction ? undefined : err.stack,
  })
}
