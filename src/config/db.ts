import mongoose from 'mongoose'
import { env } from '@/config/env'
import { logger } from '@/lib/logger'

// Filters may only use fields defined in the schema.
mongoose.set('strictQuery', true)
// While the database is unreachable, queries wait at most 2 seconds before failing (answered as 503)
// instead of the default 10. Buffering itself stays on so models can load before the connection opens.
mongoose.set('bufferTimeoutMS', 2_000)

let listenersAttached = false

export const connectDB = async (uri = env.mongodbUri) => {
  if (!listenersAttached) {
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'))
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'))
    mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { err }))
    listenersAttached = true
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  // Build declared indexes (unique email, SKU, ...) before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()))
  logger.info('MongoDB connected', { database: mongoose.connection.name })
}

export const disconnectDB = () => mongoose.disconnect()

export const databaseStatus = () => {
  const states: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }
  return states[mongoose.connection.readyState] ?? 'unknown'
}
