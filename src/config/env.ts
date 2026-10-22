import { randomBytes } from 'node:crypto'
import dotenv from 'dotenv'
import { z } from 'zod'

// Tests set their own environment; everything else reads .env.
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true })

const url = z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/$/, ''))
// One or more addresses separated by commas, e.g. the local dev server and the live site.
const urlList = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(url).min(1))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5050),
  MONGODB_URI: z.string().min(1).optional(),
  CLIENT_URL: urlList('http://localhost:5173'),
  DASHBOARD_URL: urlList('http://localhost:5174'),
  API_PUBLIC_URL: url.optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  COOKIE_SAMESITE: z.enum(['lax', 'none']).default('lax'),
  // How many proxies (load balancer, Nginx) sit in front of the API; needed for real client IPs.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
  // Fail at startup with every problem listed, rather than at the first request that needs the value.
  throw new Error(`Invalid environment configuration:\n${problems}`)
}

const vars = parsed.data
const isProduction = vars.NODE_ENV === 'production'
const isTest = vars.NODE_ENV === 'test'

// Never fall back to a local database or a throwaway signing secret in production.
if (isProduction && !vars.MONGODB_URI) throw new Error('MONGODB_URI must be set in production')
if (isProduction && !vars.JWT_SECRET) throw new Error('JWT_SECRET must be set in production')

export const env = {
  nodeEnv: vars.NODE_ENV,
  isProduction,
  isTest,
  port: vars.PORT,
  mongodbUri: vars.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/klestarmart',
  // Browsers on these origins (storefront and dashboard addresses) may call the API with cookies.
  allowedOrigins: [...vars.CLIENT_URL, ...vars.DASHBOARD_URL],
  // Public address of this API, used to build absolute URLs for uploaded images.
  publicUrl: vars.API_PUBLIC_URL ?? `http://localhost:${vars.PORT}`,
  jwtSecret: vars.JWT_SECRET ?? randomBytes(48).toString('hex'),
  jwtSecretIsRandom: !vars.JWT_SECRET,
  sessionDays: vars.SESSION_DAYS,
  // "lax" when the storefront, dashboard and API share a site (shop.com, admin.shop.com, api.shop.com);
  // "none" when they are on unrelated domains, which also requires HTTPS.
  cookieSameSite: vars.COOKIE_SAMESITE,
  trustProxy: vars.TRUST_PROXY ?? (isProduction ? 1 : 0),
  logLevel: vars.LOG_LEVEL ?? (isTest ? 'silent' : isProduction ? 'info' : 'debug'),
}
