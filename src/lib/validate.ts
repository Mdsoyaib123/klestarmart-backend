import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'

// Replaces req.body with the parsed (and stripped) result, or passes the ZodError to the error handler.
export const validateBody = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
  req.body = schema.parse(req.body)
  next()
}
