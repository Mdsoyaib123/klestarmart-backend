import type { Request, Response, NextFunction } from 'express'
import { env } from '@/config/env'

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500

  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: env.nodeEnv === 'production' ? undefined : err.stack,
  })
}
