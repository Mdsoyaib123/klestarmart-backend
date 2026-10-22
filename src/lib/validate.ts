import type { Request, Response, NextFunction } from 'express'
import { isValidObjectId } from 'mongoose'
import type { ZodType } from 'zod'
import { AppError } from '@/lib/AppError'

// Replaces req.body with the parsed (and stripped) result, or passes the ZodError to the error handler.
export const validateBody = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
  req.body = schema.parse(req.body ?? {})
  next()
}

// For router.param('id', ...): rejects malformed ids before they reach the database.
export const objectIdParam = (req: Request, res: Response, next: NextFunction, value: string) => {
  if (!isValidObjectId(value)) {
    next(new AppError(400, 'That id is not valid', { code: 'INVALID_ID' }))
    return
  }
  next()
}
