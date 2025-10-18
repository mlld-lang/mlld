// Phase 0 process helper stubs. Streaming path will adopt `execa` later.

export interface SpawnStreamOptions {
  shell?: boolean;
  timeout?: number;
  env?: Record<string, string>;
}

export interface SpawnStream {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  kill?: (signal?: string) => void;
  completed: Promise<{ exitCode: number }>; // resolves on close
}

export function spawnStream(command: string, opts: SpawnStreamOptions = {}): SpawnStream {
  // Placeholder: Phase 2 will switch to execa. For now, provide a shape that
  // throws if accidentally used.
  // eslint-disable-next-line no-throw-literal
  throw new Error('spawnStream is not available in Phase 0 (streaming disabled)');
}

