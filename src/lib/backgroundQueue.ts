type QueueTask<T> = () => Promise<T>;

export function createAsyncTaskQueue() {
  const tasks: Array<() => Promise<void>> = [];
  let processing = false;

  const processQueue = async () => {
    if (processing) return;
    processing = true;
    try {
      while (tasks.length > 0) {
        const next = tasks.shift();
        if (!next) continue;
        try {
          await next();
        } catch {
          // ignore individual queue task failures
        }
      }
    } finally {
      processing = false;
    }
  };

  return {
    enqueue<T>(task: QueueTask<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        tasks.push(async () => {
          try {
            const result = await task();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
        void processQueue();
      });
    },
  };
}
