import type { Response } from "express";

/* ---------------------------------------------------------------
   Success envelope

   Every non-empty success response is { success: true, data }. The
   error handler writes the mirror image, { success: false, error,
   requestId }, so a client checks one field to know which it got.
----------------------------------------------------------------*/

export interface SuccessBody {
  success: true;
  data: unknown;
}

export function sendSuccess(res: Response, data: unknown, statusCode = 200) {
  const body: SuccessBody = { success: true, data };
  res.status(statusCode).json(body);
}

export function sendNoContent(res: Response) {
  res.status(204).end();
}
