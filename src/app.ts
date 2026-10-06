import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { env } from '@/config/env'
import routes from '@/routes'
import { notFound } from '@/middlewares/notFound'
import { errorHandler } from '@/middlewares/errorHandler'
import { UPLOAD_DIR } from '@/modules/upload/upload.routes'

const app = express()

// Behind a proxy (Render, Nginx, ...) this makes rate limiting see the real client IP.
if (env.isProduction) app.set('trust proxy', 1)

// Uploaded images are shown by the storefront and dashboard, which run on other origins.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(
  cors({
    // The storefront and the admin dashboard are served from different origins.
    origin: [env.clientUrl, env.dashboardUrl],
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

if (env.nodeEnv === 'development') {
  app.use(morgan('dev'))
}

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' })
})

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false }))
app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

export default app
