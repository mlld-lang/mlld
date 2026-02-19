import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode, ExecInvocation } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { runBuiltinEffect } from '@interpreter/eval/pipeline/builtin-effects';
import { asText } from '@interpreter/utils/structured-value';
import { TestEffectHandler, type Effect } from '@interpreter/env/EffectHandler';
import type { PipelineCommand } from '@core/types/run';

class TracingEffectHandler extends TestEffectHandler {
  constructor(
    private readonly events: string[],
    private readonly operationEvent: string = 'operation:decision:show'
  ) {
    super();
  }

  override handleEffect(effect: Effect): void {
    if (effect.type === 'both') {
      this.events.push(this.operationEvent);
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

async function registerDirectives(source: string, env: Environment): Promise<void> {
  const directives = parseSync(source).filter(
    node => (node as DirectiveNode | undefined)?.type === 'Directive'
  ) as DirectiveNode[];
  for (const directive of directives) {
    await evaluateDirective(directive, env);
  }
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

  it('orders user hooks around built-in guard hooks for directive boundaries', async () => {
    const key = '__mlldDirectiveOrderingEvents';
    const events: string[] = [];
    (globalThis as Record<string, unknown>)[key] = events;

    try {
      const env = createEnv(new TracingEffectHandler(events, 'operation:decision:show'));
      await registerDirectives(
        `
/exe @record(event) = js {
  const raw = event && typeof event === "object" && "value" in event ? event.value : event;
  globalThis.${key}.push(String(raw));
  return raw;
}
/guard before @guardBefore for op:show = when [ * => allow @record("guard:before:show") ]
/guard after @guardAfter for op:show = when [ * => allow @record("guard:after:show") ]
/hook @userBefore before op:show = [ => @record("user:before:show") ]
/hook @userAfter after op:show = [ => @record("user:after:show") ]
        `,
        env
      );

      await evaluateDirective(parseSync('/show "directive ordering"')[0] as DirectiveNode, env);

      expect(events).toEqual([
        'user:before:show',
        'guard:before:show',
        'guard:after:show',
        'user:after:show',
        'operation:decision:show'
      ]);
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('orders user hooks around built-in guard hooks for exec boundaries', async () => {
    const key = '__mlldExecOrderingEvents';
    const events: string[] = [];
    (globalThis as Record<string, unknown>)[key] = events;

    try {
      const env = createEnv();
      await registerDirectives(
        `
/exe @record(event) = js {
  const raw = event && typeof event === "object" && "value" in event ? event.value : event;
  globalThis.${key}.push(String(raw));
  return raw;
}
/exe @emit() = js {
  globalThis.${key}.push("operation:decision:exe-body");
  return "emit";
}
/guard before @guardBefore for op:exe = when [
  @mx.op.name == "emit" => allow @record("guard:before:exe")
  * => allow
]
/guard after @guardAfter for op:exe = when [
  @mx.op.name == "emit" => allow @record("guard:after:exe")
  * => allow
]
/hook @userBefore before @emit = [ => @record("user:before:exe") ]
/hook @userAfter after @emit = [ => @record("user:after:exe") ]
        `,
        env
      );

      await evaluateExecInvocation(createExecInvocation('emit'), env);
      expect(events).toEqual([
        'user:before:exe',
        'guard:before:exe',
        'operation:decision:exe-body',
        'guard:after:exe',
        'user:after:exe'
      ]);
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('keeps effect-path ordering parity for user hooks and guard hooks', async () => {
    const key = '__mlldEffectOrderingEvents';
    const events: string[] = [];
    (globalThis as Record<string, unknown>)[key] = events;

    try {
      const env = createEnv(new TracingEffectHandler(events, 'operation:decision:effect-show'));
      await registerDirectives(
        `
/exe @record(event) = js {
  const raw = event && typeof event === "object" && "value" in event ? event.value : event;
  globalThis.${key}.push(String(raw));
  return raw;
}
/guard before @guardBeforeEffect for op:show = when [
  @mx.op.metadata.isEffect => allow @record("guard:before:effect")
  * => allow
]
/guard after @guardAfterEffect for op:show = when [
  @mx.op.metadata.isEffect => allow @record("guard:after:effect")
  * => allow
]
/hook @userBeforeEffect before op:show = [ => @record("user:before:effect") ]
/hook @userAfterEffect after op:show = [ => @record("user:after:effect") ]
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

      await runBuiltinEffect(effectCommand, 'effect ordering', env);

      expect(events).toEqual([
        'user:before:effect',
        'guard:before:effect',
        'operation:decision:effect-show',
        'guard:after:effect',
        'user:after:effect'
      ]);
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });
});
