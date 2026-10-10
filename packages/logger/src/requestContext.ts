// requestContext.ts — AsyncLocalStorage for requestId/traceId/userId.
// The requestId middleware opens the context; the logger (and anything else)
// reads it without threading parameters through every call.
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  traceId?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}
