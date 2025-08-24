// Phase 0 TTY helpers and log-update wrapper.
// Will adopt `log-update` in Phase 1/5 when streaming is enabled.

export function isTTYStdout(): boolean {
  return !!process.stdout && !!process.stdout.isTTY;
}

export function isTTYStderr(): boolean {
  return !!process.stderr && !!process.stderr.isTTY;
}

type LogUpdateFn = (text: string) => void & { done?: () => void };

export function createLogUpdate(): LogUpdateFn {
  // Minimal shim: print lines; in TTY we overwrite by carriage return
  let lastLineLength = 0;
  const fn: any = (text: string) => {
    if (isTTYStderr()) {
      const cr = '\r';
      const clear = ' '.repeat(Math.max(0, lastLineLength - text.length));
      const line = text + clear;
      process.stderr.write(cr + line);
      lastLineLength = line.length;
    } else {
      process.stderr.write(text + '\n');
    }
  };
  fn.done = () => {
    if (isTTYStderr()) process.stderr.write('\n');
  };
  return fn as LogUpdateFn;
}

