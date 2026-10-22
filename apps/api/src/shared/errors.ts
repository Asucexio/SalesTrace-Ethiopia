/**
 * Application error taxonomy.
 *
 * Every error thrown deliberately by the API carries a stable machine-readable code and an HTTP
 * status. Unexpected errors are converted into a generic `INTERNAL_ERROR` by the error handler:
 * stack traces, SQL and infrastructure details never reach a client.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATUS_TRANSITION'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNPROCESSABLE_ENTITY'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATUS_TRANSITION: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  IDEMPOTENCY_KEY_REUSED: 409,
  INTERNAL_ERROR: 500,
};

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError('BAD_REQUEST', message, details);
  }

  static validation(message: string, details?: FieldIssue[] | unknown): AppError {
    return new AppError('VALIDATION_FAILED', message, details);
  }

  static unauthenticated(message = 'Authentication is required.'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }

  static forbidden(message = 'You do not have permission to perform this action.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  /**
   * Not found.
   *
   * Used for both "does not exist" and "belongs to another organization" — the two cases are
   * deliberately indistinguishable so the API never confirms that another tenant's data exists.
   */
  static notFound(resource = 'Resource'): AppError {
    return new AppError('NOT_FOUND', `${resource} was not found.`);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, details);
  }

  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError('UNPROCESSABLE_ENTITY', message, details);
  }
}

/** True when the error is a deliberate, client-facing application error. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
