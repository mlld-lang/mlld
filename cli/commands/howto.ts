/**
 * mlld howto - Self-documenting help system
 *
 * Usage:
 *   mlld howto              # Show topic tree
 *   mlld howto when         # Show all when-related help
 *   mlld howto when first   # Show just when-first help
 *   mlld qs                 # Quick start (alias)
 */

import * as path from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { execute } from '@sdk/execute';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import type { StructuredResult } from '@sdk/types';
import { highlightMarkdown } from './info';

export interface HowtoOptions {
  topic?: string;
  subtopic?: string;
  section?: boolean;
}

/**
 * Find the mlld package root directory
 * Works both in development and when installed as a package
 */
function findPackageRoot(): string {
  // Method 1: Use require.main.path if available (bundled CLI)
  if (require.main && require.main.path) {
    // Go up from dist/ to package root
    const mainDir = require.main.path;
    const pkgRoot = path.resolve(mainDir, '..');
    if (existsSync(path.join(pkgRoot, 'package.json'))) {
      return pkgRoot;
    }
  }

  // Method 2: Look relative to current file (development)
  // In tsup bundle, __dirname is the dist directory
  const distDir = __dirname;
  const candidates = [
    path.resolve(distDir, '..'),      // From dist/
    path.resolve(distDir, '../..'),   // From cli/commands/
    process.cwd()                      // Fallback to cwd
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'llm/run/howto.mld'))) {
      return candidate;
    }
  }

  // Method 3: Check if we're running from project root
  if (existsSync(path.join(process.cwd(), 'llm/run/howto.mld'))) {
    return process.cwd();
  }

  return process.cwd();
}

/**
 * Find the howto.mld script location
 */
async function findHowtoScript(): Promise<string | null> {
  const pkgRoot = findPackageRoot();
  const scriptPath = path.join(pkgRoot, 'llm/run/howto.mld');

  if (existsSync(scriptPath)) {
    return scriptPath;
  }

  return null;
}

export async function howtoCommand(options: HowtoOptions = {}): Promise<void> {
  const scriptPath = await findHowtoScript();

  if (!scriptPath) {
    console.error(chalk.red('Error: howto.mld script not found'));
    console.log(chalk.gray('This is an internal error - the mlld installation may be corrupted.'));
    process.exit(1);
  }

  const fileSystem = new NodeFileSystem();
  const basePath = path.dirname(path.dirname(scriptPath)); // llm/run -> project root

  try {
    // Disable streaming to capture output for highlighting
    const prevStreaming = process.env.MLLD_NO_STREAMING;
    process.env.MLLD_NO_STREAMING = 'true';

    const result = await execute(scriptPath, {
      topic: options.topic || '',
      subtopic: options.subtopic || '',
      section: options.section || false
    }, {
      fileSystem,
      pathService: new PathService(basePath, fileSystem),
      timeoutMs: 30000
    }) as StructuredResult;

    // Restore streaming setting
    if (prevStreaming === undefined) {
      delete process.env.MLLD_NO_STREAMING;
    } else {
      process.env.MLLD_NO_STREAMING = prevStreaming;
    }

    // Highlight and print the output
    if (result.output) {
      console.log(highlightMarkdown(result.output));
    }

    // Clean up
    if (result.environment && 'cleanup' in result.environment) {
      result.environment.cleanup();
    }
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Create howto command for CLI integration
 */
export function createHowtoCommand() {
  return {
    name: 'howto',
    aliases: ['ht'],
    description: 'Get help on mlld topics',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
${chalk.bold('Usage:')} mlld howto [topic] [subtopic] [--section]

Get help on mlld language features and syntax.

${chalk.bold('Sections:')} syntax, commands, control-flow, modules, patterns, configuration, security, mistakes

${chalk.bold('Examples:')}
  mlld howto                    Show all available topics
  mlld howto syntax             Show ALL syntax help (whole section)
  mlld howto modules            Show ALL modules help (whole section)
  mlld howto when               Show all when-related help
  mlld howto when first         Show just when-first help
  mlld howto for-parallel       Show just parallel for help
  mlld howto for-parallel -s    Show entire control-flow section
  mlld howto grep "default"     Search all docs for "default"

${chalk.bold('Options:')}
  -s, --section   Show entire section for the matched topic
  -h, --help      Show this help message

${chalk.bold('Tip:')} Use grep to find topics, then --section to get full context.
        `);
        return;
      }

      const topic = args[0];
      const subtopic = args[1];
      const section = flags.section || flags.s;

      await howtoCommand({ topic, subtopic, section });
    }
  };
}

/**
 * Create quickstart command (qs alias) - maps to mlld howto intro
 */
export function createQuickstartCommand() {
  return {
    name: 'qs',
    aliases: ['quickstart'],
    description: 'Quick start guide for mlld (alias for howto intro)',

    async execute(_args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
${chalk.bold('Usage:')} mlld qs

Show the mlld quick start guide (alias for 'mlld howto intro').

Covers:
- Essential commands (howto, grep, validate)
- Two syntax modes
- Mental model
- Key concepts

For detailed help on specific topics, use: mlld howto <topic>
        `);
        return;
      }

      await howtoCommand({ topic: 'intro' });
    }
  };
}
