// An error with an HTTP status that is safe to show to the client.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`)
export const badRequest = (message: string) => new AppError(400, message)
