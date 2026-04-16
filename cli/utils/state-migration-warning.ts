import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
  legacyProjectStateDir,
  legacyUserStateDir,
  projectStateDir,
  userStateDir
} from '@core/paths/state-dirs';

const WARNING_SENTINEL = '.migration-warned';

function warnOnce(dir: string, message: string): void {
  const sentinel = path.join(dir, WARNING_SENTINEL);
  if (existsSync(sentinel)) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(chalk.yellow(message));
  try {
    writeFileSync(sentinel, new Date().toISOString(), 'utf8');
  } catch {
    // best-effort; leaving the warning to repeat is acceptable if we can't
    // mark the sentinel (read-only fs, permission denied, etc.)
  }
}

/**
 * Emit a one-time warning when a legacy `.mlld/` state directory is present
 * (project or user level). Writes a sentinel into the legacy dir so the
 * warning doesn't repeat. No reads or writes to the legacy dir otherwise —
 * users who want to migrate run `mlld migrate-state`.
 */
export function warnIfLegacyStateDirPresent(projectRoot: string): void {
  const legacyProject = legacyProjectStateDir(projectRoot);
  if (existsSync(legacyProject) && !existsSync(projectStateDir(projectRoot))) {
    warnOnce(
      legacyProject,
      `warning: legacy mlld state directory detected at ${legacyProject}\n` +
        `         state has moved to ${projectStateDir(projectRoot)}. Run \`mlld migrate-state\` to rename.\n` +
        `         caches and audit logs at the legacy path will not be read.`
    );
  }

  const legacyUser = legacyUserStateDir();
  if (existsSync(legacyUser) && !existsSync(userStateDir())) {
    warnOnce(
      legacyUser,
      `warning: legacy mlld user state directory detected at ${legacyUser}\n` +
        `         user state has moved to ${userStateDir()}. Run \`mlld migrate-state\` to rename.\n` +
        `         auth tokens and module caches at the legacy path will not be read.`
    );
  }
}
