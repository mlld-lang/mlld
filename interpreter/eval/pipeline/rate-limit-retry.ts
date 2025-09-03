export class RateLimitRetry {
  private attempt = 0;
  constructor(private maxAttempts = 5, private baseDelay = 500) {}

  async wait(): Promise<boolean> {
    if (this.attempt >= this.maxAttempts) return false;
    const delay = this.baseDelay * 2 ** this.attempt;
    this.attempt++;
    await new Promise(res => setTimeout(res, delay));
    return true;
  }

  reset(): void {
    this.attempt = 0;
  }
}

export function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message || '';
  return /rate limit/i.test(msg) || err.status === 429;
}
