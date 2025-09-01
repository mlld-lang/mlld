export function getParallelLimit(): number {
  const raw = process.env.MLLD_PARALLEL_LIMIT;
  const n = raw !== undefined ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return 4;
  return n;
}

export interface ParallelOptions {
  ordered?: boolean;
  paceMs?: number; // minimum delay between task starts
}

/**
 * Run a set of async tasks with a concurrency cap.
 * - ordered=true: results are placed at original indices
 * - ordered=false: results are appended in completion order
 * - paceMs: optional minimum delay between task starts
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
  opts: ParallelOptions = {}
): Promise<R[]> {
  const count = items.length;
  if (count === 0) return [];
  const cap = Math.max(1, Math.min(limit || 1, count));
  const ordered = opts.ordered !== false; // default true
  const paceMs = opts.paceMs && opts.paceMs > 0 ? opts.paceMs : 0;

  const results: R[] = ordered ? new Array(count) : [];
  let index = 0;
  let lastStart = 0;

  const nextIndex = async (): Promise<number> => {
    if (index >= count) return -1;
    // Optional simple pacing control: ensure at least paceMs between starts
    if (paceMs > 0) {
      const now = Date.now();
      const wait = Math.max(0, lastStart + paceMs - now);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      lastStart = Date.now();
    }
    return index++;
  };

  const worker = async () => {
    while (true) {
      const i = await nextIndex();
      if (i < 0) break;
      const item = items[i];
      const r = await run(item, i);
      if (ordered) {
        (results as R[])[i] = r;
      } else {
        (results as R[]).push(r);
      }
    }
  };

  const workers = Array.from({ length: cap }, () => worker());
  await Promise.all(workers);
  return results;
}

