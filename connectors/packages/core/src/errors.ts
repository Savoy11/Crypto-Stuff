export type ConnectorErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'NOT_ENTITLED'
  | 'MISSING_API_KEY'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UNSUPPORTED'

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ConnectorError'
  }
}

export function isConnectorError(err: unknown): err is ConnectorError {
  return err instanceof ConnectorError
}
