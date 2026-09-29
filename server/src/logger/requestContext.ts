import { AsyncLocalStorage } from "node:async_hooks";

/* ---------------------------------------------------------------
   Request context

   Carries the request id (and, once known, the user id) through
   every await of a request without threading it through function
   arguments. The logger's mixin reads it, so a log line written
   deep inside a service still says which request produced it.
----------------------------------------------------------------*/

export interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T,
): T => storage.run(context, callback);

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();

/** Called by requireAuth once the caller is known. */
export function setContextUserId(userId: string): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}
