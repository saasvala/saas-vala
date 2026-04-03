const counters = new Map<string, number>();
const timers = new Map<string, number[]>();

export const metrics = {
  increment(name: string, by = 1) {
    counters.set(name, (counters.get(name) || 0) + by);
  },
  timing(name: string, ms: number) {
    const current = timers.get(name) || [];
    current.push(ms);
    timers.set(name, current);
  },
  snapshot() {
    const latency = Array.from(timers.entries()).map(([name, values]) => ({
      name,
      avgMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    }));

    return {
      requestsPerSecond: counters.get('requests') || 0,
      errorRate: (counters.get('errors') || 0) / Math.max(counters.get('requests') || 1, 1),
      latency,
      counters: Object.fromEntries(counters.entries()),
    };
  },
};
