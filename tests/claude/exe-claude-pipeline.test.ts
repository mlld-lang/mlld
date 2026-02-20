import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '@grammar/parser';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluate } from '@interpreter/core/interpreter';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import type { ExecInvocation } from '@core/types';
import { claudeAvailable } from './claude-test-utils';

const describeClaude = claudeAvailable ? describe : describe.skip;

describeClaude('Claude pipelines (manual)', () => {
  let env: Environment;

  beforeAll(async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/');
  });

  it('pipes value through inline claude call', async () => {
    const src = `/exe @claudePipe(value) = @value | cmd { claude -p --model haiku "Reply only with OK: @value" }`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'claude-inline',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'claude-inline-ref',
        identifier: 'claudePipe',
        args: [{ type: 'Text', content: 'ping' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    const text = String(result.stdout || result.value || '').trim().toUpperCase();
    expect(text).toContain('OK');
  });

  it('runs command body claude with value interpolation', async () => {
    const src = `/exe @claudeInline(value) = cmd { claude -p --model haiku "Reply only with OK: @value" }`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'claude-body',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'claude-body-ref',
        identifier: 'claudeInline',
        args: [{ type: 'Text', content: 'ping' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    const text = String(result.stdout || result.value || '').trim().toUpperCase();
    expect(text).toContain('OK');
  });
});
