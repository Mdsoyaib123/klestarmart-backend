import type { Role } from '@/modules/user/user.model'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; role: Role }
    }
  }
}

export {}
