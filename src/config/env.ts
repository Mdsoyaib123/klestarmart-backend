import { randomBytes } from 'node:crypto'
import dotenv from 'dotenv'

dotenv.config()

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'

// Never fall back to a local database or a throwaway signing secret in production.
if (isProduction && !process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI must be set in production')
}
if (isProduction && (process.env.JWT_SECRET ?? '').length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production')
}
if (!isProduction && !process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set; using a random secret, so sessions end when the server restarts.')
}

const port = process.env.PORT ?? '5050'

export const env = {
  port,
  nodeEnv,
  isProduction,
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/klestarmart',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
  // Public address of this API, used to build absolute URLs for uploaded images.
  publicUrl: (process.env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET ?? randomBytes(48).toString('hex'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
  // "lax" when the storefront, dashboard and API share a site (shop.com, admin.shop.com, api.shop.com);
  // "none" when they are on unrelated domains, which also requires HTTPS.
  cookieSameSite: (process.env.COOKIE_SAMESITE === 'none' ? 'none' : 'lax') as 'lax' | 'none',
}
