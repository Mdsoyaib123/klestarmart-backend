import type { Server } from 'node:http'
import app from '@/app'
import { connectDB, disconnectDB } from '@/config/db'
import { env } from '@/config/env'
import { logger } from '@/lib/logger'

let server: Server | undefined
let shuttingDown = false

// Stop taking new connections, let in-flight requests finish, then close the database.
const shutdown = async (reason: string, exitCode = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('Shutting down', { reason })
  const force = setTimeout(() => {
    logger.error('Shutdown timed out; exiting')
    process.exit(1)
  }, 10_000)
  force.unref()
  try {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
    await disconnectDB()
  } finally {
    process.exit(exitCode)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
// A bug escaped every handler. The process may be in a bad state, so log it and restart cleanly.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { err: reason instanceof Error ? reason : new Error(String(reason)) })
  void shutdown('unhandledRejection', 1)
})
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err })
  void shutdown('uncaughtException', 1)
})

const start = async () => {
  if (env.jwtSecretIsRandom) logger.warn('JWT_SECRET is not set; sessions will end whenever the server restarts.')
  await connectDB()
  server = app.listen(env.port, () => {
    logger.info(`API listening on port ${env.port}`, { env: env.nodeEnv, publicUrl: env.publicUrl })
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    logger.error(err.code === 'EADDRINUSE' ? `Port ${env.port} is already in use. Set PORT in .env to a free port.` : 'Server error', { err })
    void shutdown('server error', 1)
  })
}

start().catch((err) => {
  logger.error('Could not start the API', { err })
  process.exit(1)
})
