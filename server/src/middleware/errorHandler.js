import { ZodError } from "zod";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { isProduction } from "../config/env.js";

/* ---------------------------------------------------------------
   Error handling

   Every failure leaves through here in one shape:
     { error: { message, details? } }

   so the frontend never has to guess whether a failed request
   returned a string, an array, or a Mongoose stack trace.
----------------------------------------------------------------*/

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

const translate = (error) => {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.badRequest(
      "Validation failed",
      error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    );
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return ApiError.badRequest(
      "Validation failed",
      Object.values(error.errors).map((fieldError) => ({
        field: fieldError.path,
        message: fieldError.message,
      })),
    );
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${error.path}`);
  }

  // Unique index violation. The offending field name is only in
  // keyPattern, so pull it out rather than echoing the driver message.
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? {})[0] ?? "field";
    return ApiError.conflict(`That ${field} is already registered`);
  }

  // express.json() rejecting a malformed body
  if (error?.type === "entity.parse.failed") {
    return ApiError.badRequest("Request body is not valid JSON");
  }

  return null;
};

// Four arguments, or Express does not recognise this as error middleware.
export function errorHandler(error, req, res, _next) {
  const known = translate(error);

  if (!known) {
    // An unexpected throw is a bug: log it in full, tell the client nothing.
    console.error(`[error] unhandled on ${req.method} ${req.originalUrl}`);
    console.error(error);

    return res.status(500).json({
      error: {
        message: "Something went wrong",
        ...(isProduction ? {} : { debug: error?.message }),
      },
    });
  }

  if (known.statusCode >= 500) console.error(error);

  return res.status(known.statusCode).json({
    error: {
      message: known.message,
      ...(known.details ? { details: known.details } : {}),
    },
  });
}
