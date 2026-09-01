/* ---------------------------------------------------------------
   Operational errors

   Anything thrown as an ApiError is a condition we anticipated —
   bad input, missing record, wrong password — and its message is
   safe to show the client. Everything else is a bug, and the error
   handler replies with a generic 500 rather than leaking internals.
----------------------------------------------------------------*/

export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Bad request", details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Not authenticated") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Not allowed") {
    return new ApiError(403, message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }

  static conflict(message = "Already exists") {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = "Too many requests") {
    return new ApiError(429, message);
  }
}
