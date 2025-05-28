/**
 * Command security module
 * Handles secure command execution and analysis
 */

export { CommandAnalyzer, CommandAnalysis, CommandRisk } from './analyzer/CommandAnalyzer';
export { CommandExecutor, CommandExecutionOptions, CommandExecutionContext } from './executor/CommandExecutor';

// Future additions:
// export { CommandSandbox } from './sandbox/CommandSandbox';
// export { ResourceLimiter } from './limits/ResourceLimiter';