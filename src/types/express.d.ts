import type { Role } from '@/modules/user/user.model'

declare global {
  namespace Express {
    interface Request {
      // Unique per request; returned in the X-Request-Id header and in error responses.
      id: string
      user?: { id: string; name: string; role: Role }
    }
  }
}

export {}
