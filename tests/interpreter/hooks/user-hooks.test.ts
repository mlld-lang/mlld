import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { asText } from '@interpreter/utils/structured-value';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function parseDirectives(source: string): DirectiveNode[] {
  return parseSync(source).filter(
    node => (node as DirectiveNode | undefined)?.type === 'Directive'
  ) as DirectiveNode[];
}

async function evaluateDirectives(source: string, env: Environment): Promise<void> {
  const directives = parseDirectives(source);
  for (const directive of directives) {
    await evaluateDirective(directive, env);
  }
}

function readTextVariable(env: Environment, name: string): string {
  const variable = env.getVariable(name);
  if (!variable) {
    throw new Error(`Missing variable @${name}`);
  }
  return asText(variable.value);
}

describe('user hook runtime', () => {
  it('chains before hook transforms in declaration order', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/exe @trimArgs(args) = js {
  const list = Array.isArray(args) ? args : [args];
  const first = list[0] && typeof list[0] === "object" && "value" in list[0] ? list[0].value : list[0];
  return String(first).trim();
}
/exe @suffixArgs(args) = js {
  const list = Array.isArray(args) ? args : [args];
  const first = list[0] && typeof list[0] === "object" && "value" in list[0] ? list[0].value : list[0];
  return String(first) + "!";
}
/exe @emit(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw);
}
/hook @trim before @emit = [ => @trimArgs(@input) ]
/hook @suffix before @emit = [ => @suffixArgs(@input) ]
/var @result = @emit("  phase3b  ")
      `,
      env
    );

    expect(readTextVariable(env, 'result')).toContain('phase3b!');
  });

  it('chains after hook transforms in declaration order', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/exe @trimOutput(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw).trim();
}
/exe @redactOutput(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw).replace("SECRET", "[REDACTED]");
}
/exe @emit() = js { return "  SECRET-token  "; }
/hook @trimAfter after @emit = [ => @trimOutput(@output) ]
/hook @redactAfter after @emit = [ => @redactOutput(@output) ]
/var @result = @emit()
      `,
      env
    );

    expect(readTextVariable(env, 'result')).toBe('[REDACTED]-token');
  });

  it('does not transform output for observation-only when hook bodies', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/exe @emit() = js { return "stable"; }
/hook @observeOnly after @emit = when [
  * => output \`observed:@output\` to "state://hook-observe"
]
/var @result = @emit()
      `,
      env
    );

    expect(readTextVariable(env, 'result')).toBe('stable');
    const writes = env.getStateWrites().filter(write => write.path === 'hook-observe');
    expect(writes).toHaveLength(1);
    expect(String(writes[0].value)).toBe('observed:stable');
  });

  it('isolates hook body errors, records them in @mx.hooks.errors, and continues hook chain', async () => {
    const env = createEnv();
    const key = '__mlldUserHookErrors';
    (globalThis as Record<string, unknown>)[key] = null;

    try {
      await evaluateDirectives(
        `
/exe @capture(errors) = js {
  globalThis.${key} = errors;
  return "captured";
}
/exe @suffix(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw) + "-after";
}
/exe @emit() = js { return "base"; }
/hook @broken after @emit = [ append "not-json" to "hook-errors.jsonl" ]
/hook @suffixAfter after @emit = [ => @suffix(@output) ]
/hook @captureAfter after @emit = [
  @capture(@mx.hooks.errors)
  => @output
]
/var @result = @emit()
        `,
        env
      );

      expect(readTextVariable(env, 'result')).toBe('base-after');
      const captured = (globalThis as Record<string, unknown>)[key] as Array<Record<string, unknown>> | null;
      expect(Array.isArray(captured)).toBe(true);
      expect(captured).toHaveLength(1);
      expect(captured?.[0]?.hookName).toBe('broken');
      expect(String(captured?.[0]?.message ?? '')).toContain('json');
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('matches function hooks with arg-prefix startsWith behavior', async () => {
    const env = createEnv();
    const key = '__mlldHookPrefixEvents';
    (globalThis as Record<string, unknown>)[key] = [];

    try {
      await evaluateDirectives(
        `
/exe @record(event) = js {
  const raw = event && typeof event === "object" && "value" in event ? event.value : event;
  globalThis.${key}.push(String(raw));
  return raw;
}
/exe @emit(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw);
}
/hook @reviewOnly before @emit("review") = [ @record("matched") ]
/var @first = @emit("review-item")
/var @second = @emit("other-item")
        `,
        env
      );

      expect(readTextVariable(env, 'first')).toBe('review-item');
      expect(readTextVariable(env, 'second')).toBe('other-item');
      expect((globalThis as Record<string, unknown>)[key]).toEqual(['matched']);
    } finally {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('allows hook bodies to emit telemetry to state:// channels', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/exe @emit() = js { return "ok"; }
/hook @telemetry after @emit = [
  output \`event:hook,op:@mx.op.name\` to "state://telemetry"
]
/var @result = @emit()
      `,
      env
    );

    expect(readTextVariable(env, 'result')).toBe('ok');
    const writes = env.getStateWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('telemetry');
    expect(String(writes[0].value)).toContain('event:hook');
  });

  it('runs before data-label hooks and applies transforms for labeled operations', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/exe sensitive @emit(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw);
}
/exe @trimValue(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw).trim();
}
/hook @trimSensitive before sensitive = [ => @trimValue(@input) ]
/var @result = @emit("  labeled-input  ")
      `,
      env
    );

    expect(readTextVariable(env, 'result')).toBe('labeled-input');
  });

  it('runs after data-label hooks for observation and transform in declaration order', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/exe untrusted @emit(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw);
}
/exe @suffixValue(value) = js {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw) + "-after";
}
/hook @observeUntrusted after untrusted = when [
  * => output \`seen:@output\` to "state://data-hooks"
]
/hook @transformUntrusted after untrusted = [ => @suffixValue(@output) ]
/var @result = @emit("label-base")
      `,
      env
    );

    expect(readTextVariable(env, 'result')).toBe('label-base-after');
    const writes = env.getStateWrites().filter(write => write.path === 'data-hooks');
    expect(writes).toHaveLength(1);
    expect(String(writes[0].value)).toBe('seen:label-base');
  });

  it('exposes op:for:iteration and op:for:batch hook visibility with @mx.for metadata', async () => {
    const env = createEnv();

    await evaluateDirectives(
      `
/hook @iter after op:for:iteration = [
  output \`iter:@mx.for.index:@mx.for.total:@mx.for.batchIndex:@mx.for.batchSize\` to "state://for-hooks"
]
/hook @batchBefore before op:for:batch = [
  output \`batch-before:@mx.for.batchIndex:@mx.for.batchSize\` to "state://for-hooks"
]
/hook @batchAfter after op:for:batch = [
  output \`batch-after:@mx.for.batchIndex:@mx.for.batchSize\` to "state://for-hooks"
]
/var @items = ["a", "b", "c"]
/var @result = for parallel(2) @item in @items => @item
      `,
      env
    );

    const writes = env
      .getStateWrites()
      .filter(write => write.path === 'for-hooks')
      .map(write => String(write.value).trim());

    const batchBefore = writes.filter(write => write.startsWith('batch-before:'));
    const batchAfter = writes.filter(write => write.startsWith('batch-after:'));
    const iterWrites = writes.filter(write => write.startsWith('iter:'));

    expect(batchBefore).toEqual(['batch-before:0:2', 'batch-before:1:1']);
    expect(batchAfter).toEqual(['batch-after:0:2', 'batch-after:1:1']);
    expect(iterWrites).toHaveLength(3);
    expect(iterWrites).toEqual(expect.arrayContaining([
      'iter:0:3:0:2',
      'iter:1:3:0:2',
      'iter:2:3:1:1'
    ]));
  });
});
