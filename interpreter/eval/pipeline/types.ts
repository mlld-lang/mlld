// Re-export types from state-machine for convenience
export type {
  PipelineEvent,
  PipelineState,
  PipelineAction,
  StageResult,
  NextStep,
  StageContext
} from './state-machine';

// Re-export types from context-builder
export type {
  InterfacePipelineContext
} from './context-builder';

// Additional pipeline types that might be needed
export interface PipelineExecutionOptions {
  format?: string;
  maxRetries?: number;
}