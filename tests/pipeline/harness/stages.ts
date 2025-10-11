import type { PipelineCommand, PipelineStage, VariableReferenceNode } from '@core/types';
import { isStructuredValue, type StructuredValue } from '@interpreter/utils/structured-value';
import type { Environment } from '@interpreter/env/Environment';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';

declare global {
  // Harness retry guard shared across sequences
  // eslint-disable-next-line no-var
  var __mlldHarnessRetryCount: number | undefined;
}

export type StageTag =
  | 'js'
  | 'structured'
  | 'foreach'
  | 'batch'
  | 'parallel'
  | 'retry'
  | 'shell'
  | 'withClause';

export interface StageSnippet {
  name: string;
  tags: StageTag[];
  build(): PipelineStage;
  allowTextDowngrade?: boolean;
  beforeSequence?: () => void;
  preservesData?: boolean;
  requiresArrayInput?: boolean;
}

const INITIALIZED = new WeakSet<Environment>();

const STAGE_LIBRARY = `
/exe @h_identity(value) = js {
  return value;
}

/exe @h_object(value) = js {
  const kind = Array.isArray(value) ? 'array' : typeof value;
  return JSON.stringify({ kind, value });
}

/exe @h_foreach(items) = foreach @h_foreach_worker(@items)

/exe @h_foreach_worker(entry) = js {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const keys = Object.keys(entry);
    return JSON.stringify({ id: entry.id ?? null, keys });
  }
  if (Array.isArray(entry)) {
    return JSON.stringify({ fallback: entry, kind: 'array' });
  }
  return JSON.stringify({ fallback: entry, kind: typeof entry });
}

/exe @h_flatten_batch(items) = js {
  if (!Array.isArray(items)) {
    return JSON.stringify(items);
  }
  const flattened = typeof items.flat === 'function'
    ? items.flat()
    : items.reduce((acc, cur) => {
        if (Array.isArray(cur)) {
          acc.push(...cur);
        } else {
          acc.push(cur);
        }
        return acc;
      }, []);
  return JSON.stringify(flattened);
}

/exe @h_batch(items) = for @item in @items => @item => | @h_flatten_batch

/exe @h_upper(value) = js {
  return String(value).toUpperCase();
}

/exe @h_lower(value) = js {
  return String(value).toLowerCase();
}

/exe @h_retry_once(value) = js {
  globalThis.__mlldHarnessRetryCount = globalThis.__mlldHarnessRetryCount ?? 0;
  if (globalThis.__mlldHarnessRetryCount === 0) {
    globalThis.__mlldHarnessRetryCount = 1;
    return { value: 'retry', from: 1, hint: 'retry-once' };
  }
  return value;
}

/exe @h_with_pipeline(value) = js {
  return value;
} with {
  pipeline: [@h_upper, @h_object]
}

/exe @h_shell_echo(value) = run { printf "%s" "@value" }
`;

let syntheticCounter = 0;

function nextNodeId(): string {
  syntheticCounter += 1;
  return `h-node-${syntheticCounter}`;
}

function createIdentifierNode(name: string): VariableReferenceNode {
  return {
    type: 'VariableReference',
    nodeId: nextNodeId(),
    identifier: name,
    valueType: 'varIdentifier'
  };
}

function makeCommand(name: string): PipelineCommand {
  return {
    identifier: [createIdentifierNode(name)],
    args: [],
    fields: [],
    rawIdentifier: name,
    rawArgs: []
  };
}

function makeParallelStage(names: string[]): PipelineStage {
  return names.map((name) => makeCommand(name));
}

async function ensureStageLibrary(env: Environment): Promise<void> {
  if (INITIALIZED.has(env)) return;

  const snippets = STAGE_LIBRARY.trim().split(/\n\n+/).filter(Boolean);

  for (const snippet of snippets) {
    const source = `${snippet}\n`;
    const parseResult = await parse(source);
    if (!parseResult.success || !parseResult.ast) {
      console.error('Harness stage parse failure:', snippet);
      throw parseResult.error || new Error('Failed to parse harness stage library');
    }
    await evaluate(parseResult.ast, env);
  }
  INITIALIZED.add(env);
}

export async function registerHarnessStages(env: Environment): Promise<StageSnippet[]> {
  await ensureStageLibrary(env);

  const snippets: StageSnippet[] = [
    {
      name: '@h_identity',
      tags: ['js', 'structured'],
      build: () => makeCommand('h_identity')
    },
    {
      name: '@h_object',
      tags: ['js', 'structured'],
      build: () => makeCommand('h_object')
    },
    {
      name: '@h_foreach',
      tags: ['foreach', 'structured'],
      build: () => makeCommand('h_foreach'),
      requiresArrayInput: true
    },
    {
      name: '@h_batch',
      tags: ['batch', 'structured'],
      build: () => makeCommand('h_batch'),
      requiresArrayInput: true
    },
    {
      name: '@h_parallel_upper_lower',
      tags: ['parallel', 'js'],
      build: () => makeParallelStage(['h_upper', 'h_lower'])
    },
    {
      name: '@h_retry_once',
      tags: ['retry', 'js'],
      build: () => makeCommand('h_retry_once'),
      beforeSequence: () => {
        globalThis.__mlldHarnessRetryCount = 0;
      },
      preservesData: true
    },
    {
      name: '@h_with_pipeline',
      tags: ['withClause', 'shell', 'js', 'structured'],
      build: () => makeCommand('h_with_pipeline')
    },
    {
      name: '@h_shell_echo',
      tags: ['shell'],
      build: () => makeCommand('h_shell_echo'),
      allowTextDowngrade: true
    }
  ];

  return snippets;
}

export function describeStage(name: string, result: StructuredValue | string): string {
  if (isStructuredValue(result)) {
    const metadataKeys = result.metadata ? Object.keys(result.metadata) : [];
    const metadataPart = metadataKeys.length ? ` metadata=[${metadataKeys.join(',')}]` : '';
    return `${name} → ${result.type}${metadataPart}`;
  }
  const text = typeof result === 'string' ? result : String(result);
  const sample = text.length > 32 ? `${text.slice(0, 29)}…` : text;
  return `${name} → text "${sample}"`;
}
