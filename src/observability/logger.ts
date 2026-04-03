export type LogContext = Record<string, unknown>;

function createReqId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const observability = {
  request(event: string, context: LogContext = {}) {
    const reqId = (context.reqId as string | undefined) || createReqId();
    console.info('[request]', { reqId, event, ...context, time: new Date().toISOString() });
    return reqId;
  },
  error(event: string, context: LogContext = {}) {
    console.error('[error]', { event, ...context, time: new Date().toISOString() });
  },
  audit(event: string, context: LogContext = {}) {
    console.info('[audit]', { event, ...context, time: new Date().toISOString() });
  },
};
