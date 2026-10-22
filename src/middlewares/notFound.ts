import type { Request, Response, NextFunction } from 'express'
import { AppError } from '@/lib/AppError'

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  next(new AppError(404, `No route for ${req.method} ${req.path}`, { code: 'ROUTE_NOT_FOUND' }))
}
