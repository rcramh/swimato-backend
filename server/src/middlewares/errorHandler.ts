import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES, type ErrorCode } from "../constants/errorCodes.js";
import {
  AppError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
} from "../errors/AppError.js";

/* ---------------------------------------------------------------
   Error handling

   Every failure leaves through here in one shape:

     { success: false,
       error: { code, message, details? },
       requestId }

   Client-safe errors (AppError with expose=true) are sent as they
   are. Everything else — bugs, database and upstream failures — is
   logged in full server-side and answered with a generic message, so
   stack traces, SQL and driver text never reach the client.
----------------------------------------------------------------*/

export interface ErrorBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: { field: string; message: string }[];
  };
  requestId: string;
}

export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  next(
    new NotFoundError(
      `No route for ${req.method} ${req.path}`,
      ERROR_CODES.ROUTE_NOT_FOUND,
    ),
  );
}

interface BodyParserError {
  type?: unknown;
}

// Errors raised by middleware we do not own, mapped to our own classes.
function translate(error: unknown): AppError | null {
  if (error instanceof AppError) return error;

  const type = (error as BodyParserError | null)?.type;
  if (type === "entity.parse.failed") {
    return new ValidationError(
      "Request body is not valid JSON",
      undefined,
      ERROR_CODES.INVALID_JSON,
    );
  }
  if (type === "entity.too.large") return new PayloadTooLargeError();

  return null;
}

// Four parameters, or Express does not treat this as error middleware.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const known = translate(error);
  const statusCode = known?.statusCode ?? 500;

  // pino-http picks this up and logs the request at error level with
  // the full error, stack and cause — once, with the request id.
  if (statusCode >= 500) {
    res.err = error instanceof Error ? error : new Error(String(error));
  }

  const exposed = known?.expose ? known : null;

  const body: ErrorBody = {
    success: false,
    error: {
      code: exposed?.code ?? known?.code ?? ERROR_CODES.INTERNAL_ERROR,
      message: exposed?.message ?? "Something went wrong",
      ...(exposed?.details ? { details: exposed.details } : {}),
    },
    // genReqId (requestLogger.ts) always produces a string
    requestId: typeof req.id === "string" ? req.id : "unknown",
  };

  // Headers may already be out if a stream failed mid-response; the
  // only safe move then is to let Express close the connection.
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(statusCode).json(body);
}
