import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateDirective } from './directive';
import { extractDirectiveInputs } from './directive-inputs';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('directive replay', () => {
  it('does not pollute pipeline guard history when replaying inline exec invocations', async () => {
    const env = createEnv();
    const directives = parseSync(`
/guard @allowSecret for secret = when [ * => allow ]
/exe @echo(value) = @value
/var secret @data = "ok"
    `).filter(node => (node as DirectiveNode).kind) as DirectiveNode[];

    for (const directive of directives) {
      await evaluateDirective(directive, env);
    }

    env.resetPipelineGuardHistory();
    const pipelineContext: PipelineContextSnapshot = {
      stage: 1,
      totalStages: 1,
      currentCommand: 'manual',
      input: 'ok',
      previousOutputs: [],
      format: undefined,
      attemptCount: 1,
      attemptHistory: [],
      hint: null,
      hintHistory: [],
      sourceRetryable: true,
      guards: env.getPipelineGuardHistory()
    };
    env.setPipelineContext(pipelineContext);

    const showDirective = parseSync('/show @echo(@data)')[0] as DirectiveNode;
    await extractDirectiveInputs(showDirective, env);

    expect(env.getPipelineGuardHistory()).toHaveLength(0);
    env.clearPipelineContext();
  });
});
