import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { env } from '@/config/env'
import routes from '@/routes'
import { notFound } from '@/middlewares/notFound'
import { errorHandler } from '@/middlewares/errorHandler'

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

if (env.nodeEnv === 'development') {
  app.use(morgan('dev'))
}

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' })
})

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

export default app
