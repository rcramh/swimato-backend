import { ERROR_CODES, type ErrorCode } from "../constants/errorCodes.js";

/* ---------------------------------------------------------------
   Application errors

   Anything thrown as an AppError is a condition we anticipated, and
   its `code` and `message` are safe to send to the client. Anything
   else reaching the error handler is a bug and becomes a generic 500.

   `expose: false` marks errors whose message is for the logs only
   (database and upstream failures): the client gets a generic
   message, the log gets the detail and the original `cause`.
----------------------------------------------------------------*/

export interface FieldIssue {
  field: string;
  message: string;
}

interface AppErrorOptions {
  details?: FieldIssue[];
  cause?: unknown;
  expose?: boolean;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: FieldIssue[] | undefined;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    details?: FieldIssue[],
    code: ErrorCode = ERROR_CODES.VALIDATION_FAILED,
  ) {
    super(400, code, message, details ? { details } : {});
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message = "Not authenticated",
    code: ErrorCode = ERROR_CODES.AUTHENTICATION_REQUIRED,
  ) {
    super(401, code, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(
    message = "You do not have access to this resource",
    code: ErrorCode = ERROR_CODES.FORBIDDEN,
  ) {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "Resource not found",
    code: ErrorCode = ERROR_CODES.RESOURCE_NOT_FOUND,
  ) {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Resource already exists",
    code: ErrorCode = ERROR_CODES.CONFLICT,
  ) {
    super(409, code, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Request body is too large") {
    super(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests, try again later") {
    super(429, ERROR_CODES.RATE_LIMITED, message);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(503, ERROR_CODES.DATABASE_ERROR, message, { cause, expose: false });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(502, ERROR_CODES.EXTERNAL_SERVICE_ERROR, message, {
      cause,
      expose: false,
    });
  }
}
