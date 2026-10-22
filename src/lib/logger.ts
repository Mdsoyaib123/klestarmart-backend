import { env } from '@/config/env'

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }
const COLORS: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }

type Fields = Record<string, unknown>

// Errors do not serialise to JSON on their own; keep the useful parts.
const serialise = (fields: Fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) =>
      value instanceof Error ? [key, { name: value.name, message: value.message, stack: value.stack }] : [key, value],
    ),
  )

const write = (level: Level, message: string, fields: Fields = {}) => {
  if (ORDER[level] < ORDER[env.logLevel]) return
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout

  // Production: one JSON object per line, ready for log collectors.
  if (env.isProduction) {
    stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...serialise(fields) })}\n`)
    return
  }

  // Development: short, readable lines.
  const { err, ...rest } = fields
  const extra = Object.keys(rest).length ? ` \x1b[90m${JSON.stringify(rest)}\x1b[0m` : ''
  stream.write(`${COLORS[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${message}${extra}\n`)
  if (err instanceof Error && err.stack) stream.write(`${err.stack}\n`)
}

export const logger = {
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
}
