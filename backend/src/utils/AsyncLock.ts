export class AsyncLock {
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const runPromise = this.queue.then(() => fn());
    this.queue = runPromise.catch(() => undefined);
    return runPromise;
  }
}

