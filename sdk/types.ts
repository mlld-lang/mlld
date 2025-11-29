import type { ResolvedURLConfig } from '@core/config/types';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import type { PathContext } from '@core/services/PathContextService';
import type { DirectiveKind, MlldNode } from '@core/types';
import type { DirectiveTrace } from '@core/types/trace';
import type { CapabilityContext, DataLabel, SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import type { StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import type { EffectHandler, Effect } from '@interpreter/env/EffectHandler';
import type { Environment } from '@interpreter/env/Environment';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { ExecutionEmitter } from './execution-emitter';
import type { GuardResult } from '@core/types/guard';

export type InterpretMode = 'document' | 'structured' | 'stream' | 'debug';

export interface CommandExecutionOptions {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  showCommandContext?: boolean;
  timeout?: number;
}

export interface InterpretOptions {
  basePath?: string;
  filePath?: string;
  pathContext?: PathContext;
  strict?: boolean;
  format?: 'markdown' | 'xml';
  fileSystem: IFileSystemService;
  pathService: IPathService;
  urlConfig?: ResolvedURLConfig;
  outputOptions?: CommandExecutionOptions;
  stdinContent?: string;
  approveAllImports?: boolean;
  normalizeBlankLines?: boolean;
  enableTrace?: boolean;
  useMarkdownFormatter?: boolean;
  localFileFuzzyMatch?: FuzzyMatchConfig | boolean;
  resolverManager?: any;
  captureEnvironment?: (env: Environment) => void;
  captureErrors?: boolean;
  ephemeral?: boolean;
  effectHandler?: EffectHandler;
  allowAbsolutePaths?: boolean;
  streaming?: StreamingOptions;
  mode?: InterpretMode;
  provenance?: boolean;
  recordEffects?: boolean;
  emitter?: ExecutionEmitter;
}

export interface StructuredEffect extends Effect {
  capability?: CapabilityContext;
  security?: SecurityDescriptor;
  provenance?: SecurityDescriptor;
}

export interface ExportMetadata {
  capability?: CapabilityContext;
  security?: SecurityDescriptor;
  provenance?: SecurityDescriptor;
}

export interface StructuredExport {
  name: string;
  value: unknown;
  metadata?: ExportMetadata;
}

export type ExportMap = Record<string, StructuredExport>;

export interface StructuredResult {
  output: string;
  effects: StructuredEffect[];
  exports: ExportMap;
  environment?: Environment;
}

export type DocumentResult = string;

type StreamChunkEvent = Extract<StreamEvent, { type: 'CHUNK' }>;
type StreamLifecycleEvent = Exclude<StreamEvent, StreamChunkEvent>;

export type SDKEffectEvent = {
  type: 'effect';
  effect: StructuredEffect;
  timestamp: number;
};

export type SDKCommandEvent =
  | {
      type: 'command:start';
      command?: string;
      stageIndex?: number;
      parallelIndex?: number;
      pipelineId?: string;
      timestamp: number;
    }
  | {
      type: 'command:complete';
      command?: string;
      stageIndex?: number;
      parallelIndex?: number;
      pipelineId?: string;
      durationMs?: number;
      error?: Error;
      timestamp: number;
      capability?: CapabilityContext;
    };

export type SDKStreamEvent =
  | {
      type: 'stream:chunk';
      event: StreamChunkEvent;
    }
  | {
      type: 'stream:progress';
      event: StreamLifecycleEvent;
    };

export type SDKExecutionEvent = {
  type: 'execution:complete';
  result?: StructuredResult;
  timestamp: number;
};

export type SDKDebugEvent =
  | {
      type: 'debug:directive:start';
      directive: DirectiveKind | string;
      node?: MlldNode;
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:directive:complete';
      directive: DirectiveKind | string;
      durationMs?: number;
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:variable:create';
      name: string;
      variable?: Variable;
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:variable:access';
      name: string;
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:guard:before';
      guard: string;
      labels?: readonly DataLabel[];
      decision?: 'allow' | 'deny' | 'retry';
      trace?: readonly GuardResult[];
      hints?: readonly unknown[];
      reasons?: readonly string[];
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:guard:after';
      guard: string;
      labels?: readonly DataLabel[];
      decision?: 'allow' | 'deny';
      trace?: readonly GuardResult[];
      hints?: readonly unknown[];
      reasons?: readonly string[];
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:export:registered';
      name: string;
      timestamp: number;
      provenance?: SecurityDescriptor;
    }
  | {
      type: 'debug:import:dynamic';
      path: string;
      source: string;
      tainted: true;
      variables: string[];
      timestamp: number;
      provenance?: SecurityDescriptor;
    };

export type SDKEvent = SDKEffectEvent | SDKCommandEvent | SDKStreamEvent | SDKExecutionEvent | SDKDebugEvent;

export type SDKEventHandler<T extends SDKEvent = SDKEvent> = (event: T) => void;

export interface StreamExecution {
  on: (type: SDKEvent['type'], handler: SDKEventHandler) => void;
  off: (type: SDKEvent['type'], handler: SDKEventHandler) => void;
  once?: (type: SDKEvent['type'], handler: SDKEventHandler) => void;
  done: () => Promise<void>;
  result: () => Promise<StructuredResult>;
  isComplete: () => boolean;
  abort?: () => void;
}

export interface DebugResult extends StructuredResult {
  ast?: MlldNode;
  variables?: Record<string, Variable>;
  trace: SDKEvent[];
  directiveTrace?: DirectiveTrace[];
  durationMs?: number;
}

export type InterpretResult = DocumentResult | StructuredResult | StreamExecution | DebugResult;
