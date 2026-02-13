/**
 * Event loop for the task handler agent system.
 *
 * Watches tasks/pending/ for new task files (JSON).
 * For each task: calls the mlld orchestrator which routes, dispatches, and gates.
 * Tasks are processed sequentially to maintain coherence.
 *
 * Usage: npx tsx src/index.ts [--watch-dir tasks/pending] [--done-dir tasks/done]
 */

import { execSync } from 'child_process';
import { readdirSync, renameSync, mkdirSync, watch, existsSync } from 'fs';
import { join, resolve } from 'path';

const WATCH_DIR = process.argv.includes('--watch-dir')
  ? process.argv[process.argv.indexOf('--watch-dir') + 1]
  : 'tasks/pending';

const DONE_DIR = process.argv.includes('--done-dir')
  ? process.argv[process.argv.indexOf('--done-dir') + 1]
  : 'tasks/done';

const RETRY_DIR = 'tasks/retry';
const ORCHESTRATOR = resolve(__dirname, '../index.mld');

// Ensure directories exist
for (const dir of [WATCH_DIR, DONE_DIR, RETRY_DIR]) {
  mkdirSync(dir, { recursive: true });
}

/**
 * Process a single task file through the mlld orchestrator.
 * The orchestrator handles routing, dispatch, and gating internally.
 */
function processTask(taskFile: string): void {
  const taskPath = join(WATCH_DIR, taskFile);
  const resultPath = join(DONE_DIR, taskFile);

  console.log(`[event-loop] Processing: ${taskFile}`);

  try {
    execSync(
      `mlld "${ORCHESTRATOR}" --task "${taskPath}" --output "${resultPath}"`,
      { stdio: 'inherit', timeout: 300_000 }
    );
    // Move task to done (orchestrator already wrote result)
    if (existsSync(taskPath)) {
      renameSync(taskPath, join(DONE_DIR, `source-${taskFile}`));
    }
    console.log(`[event-loop] Done: ${taskFile}`);
  } catch (err) {
    console.error(`[event-loop] Failed: ${taskFile}`, (err as Error).message);
    if (existsSync(taskPath)) {
      renameSync(taskPath, join(RETRY_DIR, taskFile));
    }
  }
}

/** Drain any tasks already in the pending directory. */
function drainPending(): void {
  const files = readdirSync(WATCH_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    processTask(file);
  }
}

// Process existing tasks first
drainPending();

// Watch for new tasks
console.log(`[event-loop] Watching ${WATCH_DIR} for new tasks...`);
watch(WATCH_DIR, (eventType, filename) => {
  if (eventType === 'rename' && filename?.endsWith('.json')) {
    const fullPath = join(WATCH_DIR, filename);
    if (existsSync(fullPath)) {
      // Small delay to ensure file is fully written
      setTimeout(() => processTask(filename), 100);
    }
  }
});
