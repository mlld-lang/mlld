/**
 * Command security module
 * Handles secure command execution and analysis
 */

export { CommandAnalyzer } from './analyzer/CommandAnalyzer';
export type { CommandAnalysis, CommandRisk } from './analyzer/CommandAnalyzer';

export { CommandExecutor } from './executor/CommandExecutor';
export type { CommandExecutionOptions, CommandExecutionContext } from './executor/CommandExecutor';

// Future additions:
// export { CommandSandbox } from './sandbox/CommandSandbox';
// export { ResourceLimiter } from './limits/ResourceLimiter';