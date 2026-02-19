import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import type { PipelineCommand } from '@core/types/run';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { runBuiltinEffect } from '@interpreter/eval/pipeline/builtin-effects';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function parseDirectives(source: string): DirectiveNode[] {
  return parseSync(source).filter(
    node => (node as DirectiveNode | undefined)?.type === 'Directive'
  ) as DirectiveNode[];
}

async function evaluateDirectives(source: string, env: Environment): Promise<void> {
  for (const directive of parseDirectives(source)) {
    await evaluateDirective(directive, env);
  }
}

function createExecInvocation(identifier: string): ExecInvocation {
  return {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier }],
      args: []
    }
  };
}

describe('guard-denial after-hook lifecycle', () => {
  it('runs user after hooks for directive guard denials before rethrowing', async () => {
    const env = createEnv();
    await evaluateDirectives(
      `
/guard before @denyShow for op:show = when [ * => deny "blocked-show" ]
/hook @auditShow after op:show = [
  output \`directive:@mx.denied:@output.reason\` to "state://denials"
]
      `,
      env
    );

    const showDirective = parseSync('/show "hello"')[0] as DirectiveNode;
    await expect(evaluateDirective(showDirective, env)).rejects.toThrow(/blocked-show/);

    const writes = env.getStateWrites().filter(write => write.path === 'denials');
    expect(writes).toHaveLength(1);
    expect(String(writes[0].value)).toContain('directive:true:blocked-show');
  });

  it('runs user after hooks for exec pre-guard denials before rethrowing', async () => {
    const env = createEnv();
    await evaluateDirectives(
      `
/exe @emit() = js { return "ok"; }
/guard before @denyExec for op:exe = when [
  @mx.op.name == "emit" => deny "blocked-exec"
  * => allow
]
/hook @auditExec after @emit = [
  output \`exec:@mx.denied:@output.reason\` to "state://denials"
]
      `,
      env
    );

    await expect(evaluateExecInvocation(createExecInvocation('emit'), env)).rejects.toThrow(/blocked-exec/);

    const writes = env.getStateWrites().filter(write => write.path === 'denials');
    expect(writes).toHaveLength(1);
    expect(String(writes[0].value)).toContain('exec:true:blocked-exec');
  });

  it('runs user after hooks for builtin effect guard denials before rethrowing', async () => {
    const env = createEnv();
    await evaluateDirectives(
      `
/guard before @denyEffect for op:show = when [
  @mx.op.metadata.isEffect => deny "blocked-effect"
  * => allow
]
/hook @auditEffect after op:show = when [
  @mx.op.metadata.isEffect => output \`effect:@mx.denied:@output.reason\` to "state://denials"
]
      `,
      env
    );

    const effectCommand = {
      identifier: [{ type: 'VariableReference', identifier: 'show' }],
      args: [],
      rawIdentifier: 'show',
      rawArgs: [],
      meta: { hasExplicitSource: false }
    } as PipelineCommand;

    await expect(runBuiltinEffect(effectCommand, 'effect payload', env)).rejects.toThrow(/blocked-effect/);

    const writes = env.getStateWrites().filter(write => write.path === 'denials');
    expect(writes).toHaveLength(1);
    expect(String(writes[0].value)).toContain('effect:true:blocked-effect');
  });
});
