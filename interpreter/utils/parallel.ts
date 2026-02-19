export function getParallelLimit(): number {
  const raw = process.env.MLLD_PARALLEL_LIMIT;
  const n = raw !== undefined ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return 4;
  return n;
}

export interface ParallelOptions {
  ordered?: boolean;
  paceMs?: number; // minimum delay between task starts
  onBatchStart?: (batch: ParallelBatchInfo) => Promise<void> | void;
  onBatchEnd?: (batch: ParallelBatchInfo) => Promise<void> | void;
}

export interface ParallelBatchInfo {
  batchIndex: number;
  batchSize: number;
  totalItems: number;
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
  run: (item: T, index: number, batch: ParallelBatchInfo) => Promise<R>,
  opts: ParallelOptions = {}
): Promise<R[]> {
  const count = items.length;
  if (count === 0) return [];
  const cap = Math.max(1, Math.min(limit || 1, count));
  const ordered = opts.ordered !== false; // default true
  const paceMs = opts.paceMs && opts.paceMs > 0 ? opts.paceMs : 0;

  const results: R[] = ordered ? new Array(count) : [];
  const batchInfo: ParallelBatchInfo = {
    batchIndex: 0,
    batchSize: count,
    totalItems: count
  };
  let index = 0;
  let pacingChain: Promise<void> = Promise.resolve();

  const nextIndex = async (): Promise<number> => {
    // Optional simple pacing control: ensure at least paceMs between starts
    if (paceMs > 0) {
      const prev = pacingChain;
      let release!: () => void;
      pacingChain = new Promise<void>(res => { release = res; });
      await prev; // serialize starts
      setTimeout(release, paceMs);
    }
    if (index >= count) return -1;
    return index++;
  };

  await opts.onBatchStart?.(batchInfo);
  const worker = async () => {
    while (true) {
      const i = await nextIndex();
      if (i < 0) break;
      const item = items[i];
      const r = await run(item, i, batchInfo);
      if (ordered) {
        (results as R[])[i] = r;
      } else {
        (results as R[]).push(r);
      }
    }
  };

  const workers = Array.from({ length: cap }, () => worker());
  await Promise.all(workers);
  await opts.onBatchEnd?.(batchInfo);
  return results;
}
