import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { databaseStatus } from '@/config/db'
import { env } from '@/config/env'
import { errorHandler } from '@/middlewares/errorHandler'
import { notFound } from '@/middlewares/notFound'
import { originCheck } from '@/middlewares/originCheck'
import { apiLimiter } from '@/middlewares/rateLimit'
import { requestContext } from '@/middlewares/requestContext'
import { UPLOAD_DIR } from '@/modules/upload/upload.routes'
import routes from '@/routes'

const app = express()

// Behind a proxy (Render, Nginx, ...) this makes rate limiting and logs see the real client IP.
app.set('trust proxy', env.trustProxy)
app.disable('x-powered-by')

app.use(requestContext)
// Uploaded images are shown by the storefront and dashboard, which run on other origins.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(
  cors({
    origin: env.allowedOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  }),
)
app.use(compression())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(cookieParser())

// Liveness and readiness in one: 200 when the database is reachable, 503 otherwise.
app.get('/health', (req, res) => {
  const database = databaseStatus()
  const healthy = database === 'connected'
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    database,
    uptimeSeconds: Math.round(process.uptime()),
  })
})

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, fallthrough: false }))
app.use('/api', apiLimiter, originCheck, routes)

app.use(notFound)
app.use(errorHandler)

export default app
