export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiters: Array<(value: IteratorResult<T>) => void> = [];
  private ended = false;
  private error: unknown;

  push(item: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: item, done: false });
      return;
    }
    this.queue.push(item);
  }

  end(error?: unknown): void {
    if (this.ended) return;
    this.ended = true;
    this.error = error;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.({ value: undefined as any, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift() as T;
        continue;
      }

      if (this.ended) {
        if (this.error) {
          throw this.error;
        }
        return;
      }

      const next = await new Promise<IteratorResult<T>>(resolve => this.waiters.push(resolve));
      if (next.done) {
        if (this.error) {
          throw this.error;
        }
        return;
      }
      yield next.value;
    }
  }
}
