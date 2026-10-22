// Machine-readable error codes. Clients branch on `code`; `message` is for people.
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'INVALID_ID'
  | 'INVALID_JSON'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_SUSPENDED'
  | 'FORBIDDEN'
  | 'FORBIDDEN_ORIGIN'
  | 'NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE'
  | 'EDIT_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'ITEMS_UNAVAILABLE'
  | 'OUT_OF_STOCK'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export interface FieldError {
  field: string
  message: string
}

interface Options {
  code?: ErrorCode
  // Per-field problems, for forms.
  errors?: FieldError[]
  // Extra structured data the client can act on (e.g. which items are out of stock).
  details?: Record<string, unknown>
}

const DEFAULT_CODES: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
}

// An expected error whose status and message are safe to show to the client.
export class AppError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly errors?: FieldError[]
  readonly details?: Record<string, unknown>

  constructor(status: number, message: string, options: Options = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = options.code ?? DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST')
    this.errors = options.errors
    this.details = options.details
  }
}

export const badRequest = (message: string, options?: Options) => new AppError(400, message, options)
export const unauthorized = (message = 'Please sign in to continue', options?: Options) => new AppError(401, message, options)
export const forbidden = (message = 'You do not have permission to do this', options?: Options) => new AppError(403, message, options)
export const notFound = (what: string) => new AppError(404, `${what} not found`)
export const conflict = (message: string, options?: Options) => new AppError(409, message, options)
