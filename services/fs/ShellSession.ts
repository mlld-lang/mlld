/**
 * ShellSession provides a stateful bash execution environment backed by mlld's VirtualFS.
 *
 * It bridges just-bash's Bash interpreter with VirtualFS so that shell commands
 * (cat, grep, ls, etc.) operate against the same copy-on-write shadow state
 * that mlld's own interpreter uses. This enables AI agent tool calls to run
 * sandboxed bash commands whose filesystem effects are fully inspectable
 * via VirtualFS.changes(), fileDiff(), export(), and flush().
 *
 * Usage:
 *   const vfs = VirtualFS.empty();
 *   const shell = ShellSession.create(vfs);
 *   const result = await shell.exec('echo "hello" > /tmp/out.txt && cat /tmp/out.txt');
 *   // result.stdout === "hello\n"
 *   // vfs.changes() shows the created file
 */

import { Bash } from 'just-bash';
import type { BashOptions, ExecOptions, BashExecResult } from 'just-bash';
import type { VirtualFS } from './VirtualFS';
import { VirtualFSAdapter } from './VirtualFSAdapter';

export interface ShellSessionOptions {
  /** Initial environment variables */
  env?: Record<string, string>;
  /** Initial working directory (default: /home/user) */
  cwd?: string;
  /** Execution limits for runaway protection */
  executionLimits?: BashOptions['executionLimits'];
  /** Custom commands to register */
  customCommands?: BashOptions['customCommands'];
  /** Network configuration for curl */
  network?: BashOptions['network'];
}

export class ShellSession {
  readonly bash: Bash;
  readonly adapter: VirtualFSAdapter;

  private constructor(
    public readonly vfs: VirtualFS,
    adapter: VirtualFSAdapter,
    bash: Bash
  ) {
    this.adapter = adapter;
    this.bash = bash;
  }

  /**
   * Create a ShellSession backed by the given VirtualFS.
   *
   * The VirtualFS instance is shared — any files already in shadow state
   * are visible to bash commands, and any bash writes land in shadow state.
   */
  static create(vfs: VirtualFS, options?: ShellSessionOptions): ShellSession {
    const adapter = new VirtualFSAdapter(vfs);
    const bash = new Bash({
      fs: adapter,
      cwd: options?.cwd ?? '/home/user',
      env: options?.env,
      executionLimits: options?.executionLimits,
      customCommands: options?.customCommands,
      network: options?.network,
    });
    return new ShellSession(vfs, adapter, bash);
  }

  /**
   * Execute a bash command line against the VirtualFS.
   *
   * Returns stdout, stderr, exitCode, and the final environment.
   * All filesystem side effects land in VirtualFS shadow state.
   */
  async exec(
    commandLine: string,
    options?: ExecOptions
  ): Promise<BashExecResult> {
    return await this.bash.exec(commandLine, options);
  }

  /** Current working directory of the shell */
  getCwd(): string {
    return this.bash.getCwd();
  }

  /** Current environment variables */
  getEnv(): Record<string, string> {
    return this.bash.getEnv();
  }
}
