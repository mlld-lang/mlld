import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { asText } from '@interpreter/utils/structured-value';
import { TestEffectHandler, type Effect } from '@interpreter/env/EffectHandler';

class TracingEffectHandler extends TestEffectHandler {
  constructor(private readonly events: string[]) {
    super();
  }

  override handleEffect(effect: Effect): void {
    if (effect.type === 'both') {
      this.events.push('operation:decision:show');
    }
    super.handleEffect(effect);
  }
}

function createEnv(effectHandler?: TestEffectHandler): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  if (effectHandler) {
    env.setEffectHandler(effectHandler);
  }
  return env;
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

describe('hook lifecycle characterization baseline', () => {
  it('pins directive ordering around HookManager.runPre, execution, and runPost', async () => {
    const events: string[] = [];
    const env = createEnv(new TracingEffectHandler(events));

    env.getHookManager().registerPre(async (_node, _inputs, _env, operation) => {
      if (operation?.type === 'show') {
        events.push('hook:before:show');
      }
      return { action: 'continue' };
    });

    env.getHookManager().registerPost(async (_node, result, _inputs, _env, operation) => {
      if (operation?.type === 'show') {
        events.push('hook:after:show');
      }
      return result;
    });

    const directive = parseSync('/show "lifecycle baseline"')[0] as DirectiveNode;
    await evaluateDirective(directive, env);

    expect(events).toEqual([
      'hook:before:show',
      'operation:decision:show',
      'hook:after:show'
    ]);
  });

  it('pins exec invocation ordering around runExecPreGuards and runExecPostGuards', async () => {
    const key = '__mlldExecLifecycleEvents';
    const events: string[] = [];
    (globalThis as Record<string, unknown>)[key] = events;

    try {
      const env = createEnv();
      const exeDirective = parseSync(
        `/exe @emit() = js { globalThis.${key}.push("operation:decision:exec-body"); return "ok"; }`
      )[0] as DirectiveNode;
      await evaluateDirective(exeDirective, env);

      env.getHookManager().registerPre(async (node, _inputs, _env, operation) => {
        if (node.type === 'ExecInvocation' && operation?.type === 'exe') {
          events.push('hook:before:exe');
        }
        return { action: 'continue' };
      });

      env.getHookManager().registerPost(async (node, result, _inputs, _env, operation) => {
        if (node.type === 'ExecInvocation' && operation?.type === 'exe') {
          events.push('hook:after:exe');
        }
        return result;
      });

      const result = await evaluateExecInvocation(createExecInvocation('emit'), env);
      expect(asText(result.value)).toContain('ok');
      expect(events).toEqual([
        'hook:before:exe',
        'operation:decision:exec-body',
        'hook:after:exe'
      ]);
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('pins current guard suppression behavior for nested guard-evaluated operations', async () => {
    const key = '__mlldGuardSuppressionEvents';
    const events: string[] = [];
    (globalThis as Record<string, unknown>)[key] = events;

    try {
      const env = createEnv();
      const directives = parseSync(`
/exe @emit() = js {
  globalThis.${key}.push("operation:decision:emit-body");
  return "raw";
}
/exe @helper(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  globalThis.${key}.push("operation:decision:helper-body");
  return "wrapped:" + raw;
}
/exe @record(event) = js {
  const raw = event && typeof event === "object" && "value" in event ? event.value : event;
  globalThis.${key}.push(String(raw));
  return raw;
}
/guard before @helperGuard for op:exe = when [
  @mx.op.name == "helper" => allow @record("guard-before-helper")
  * => allow
]
/guard after @wrap for op:exe = when [
  @mx.op.name == "emit" => allow @helper(@output)
  * => allow
]
      `).filter(node => (node as DirectiveNode | undefined)?.type === 'Directive') as DirectiveNode[];

      for (const directive of directives) {
        await evaluateDirective(directive, env);
      }

      const result = await evaluateExecInvocation(createExecInvocation('emit'), env);
      expect(asText(result.value)).toContain('wrapped:raw');
      expect(events).toEqual([
        'operation:decision:emit-body',
        'operation:decision:helper-body'
      ]);
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });
});
