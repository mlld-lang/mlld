import { describe, expect, it, vi } from 'vitest';
import { parseSync } from '@grammar/parser';
import { isDirectiveNode, type DirectiveNode } from '@core/types';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { createGuardInputHelper } from '@core/types/variable/ArrayHelpers';
import { makeSecurityDescriptor } from '@core/types/security';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { evaluateDirective } from '@interpreter/eval/directive';
import { guardPreHook } from '@interpreter/hooks/guard-pre-hook';
import { attachGuardHelper } from '@interpreter/hooks/guard-helper-injection';

const SIMPLE_SOURCE = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createSecretVariable(name: string, value: string): Variable {
  return createSimpleTextVariable(
    name,
    value,
    SIMPLE_SOURCE,
    {
      security: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] })
    }
  );
}

function asVariableText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return String(value ?? '');
  }
  const variable = value as { value?: unknown };
  return String(variable.value ?? '');
}

describe('guard helper injection', () => {
  it('keeps parent tagValue fallback and built-in prefixWith precedence', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const directives = parseSync(`
/exe @prefixWith(label, value) = js {
  return "parent-prefix:" + label + ":" + value;
}
/exe @tagValue(timing, value, input) = js {
  return "parent-tag:" + timing + ":" + value;
}
/guard @prep for secret = when [
  @inputHas("secret") => allow @prefixWith("wrapped", @tagValue("before", @output, @input))
  * => deny "helper fallback failed"
]
    `).filter(isDirectiveNode) as DirectiveNode[];

    for (const directive of directives) {
      await evaluateDirective(directive, env);
    }

    env.setVariable('secretVar', createSecretVariable('secretVar', 'value'));
    await evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, env);

    expect(effects.getOutput().trim()).toBe('wrapped:parent-tag:before:value');
  });

  it('injects a complete helper set when parent helpers are absent', async () => {
    const env = createEnv();
    const effects = env.getEffectHandler() as TestEffectHandler;
    const guardDirective = parseSync(`
/guard for secret = when [
  @opIs("show") && @opHas("op:show") && @opHasAny("op:show") && @opHasAll("op:show") && @inputHas("secret")
    => allow @prefixWith("all", @tagValue("before", @output, @input))
  * => deny "helper set incomplete"
]
    `).filter(isDirectiveNode)[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable('secretVar', createSecretVariable('secretVar', 'value'));
    await evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, env);

    expect(effects.getOutput().trim()).toBe('all:before:value');
  });

  it('keeps helpers interoperable with replacement and env action evaluators', async () => {
    const env = createEnv();
    const directives = parseSync(`
/guard @replace for secret = when [
  * => allow @prefixWith("safe", @tagValue("before", @output, @input))
]
/guard @cfg for op:show = when [
  * => env @prefixWith("cfg", @tagValue("before", @output, @input))
]
    `).filter(isDirectiveNode) as DirectiveNode[];

    for (const directive of directives) {
      await evaluateDirective(directive, env);
    }

    const showDirective = parseSync('/show @secretVar')[0] as DirectiveNode;
    const inputVariable = createSecretVariable('secretVar', 'value');
    const operation: OperationContext = {
      type: 'show',
      subtype: 'show',
      opLabels: ['op:show']
    };

    const decision = await guardPreHook(showDirective, [inputVariable], env, operation);
    const transformedInputs = decision.metadata?.transformedInputs as Variable[] | undefined;

    expect(decision.action).toBe('continue');
    expect(asVariableText(transformedInputs?.[0])).toBe('safe:before:value');
    expect(decision.metadata?.envConfig).toBe('cfg:before:safe:before:value');
    expect(decision.metadata?.envGuard).toBe('cfg');
  });

  it('emits helper availability debug markers for attach and skip paths', async () => {
    const originalDebug = process.env.MLLD_DEBUG_GUARDS;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let capturedCalls: unknown[][] = [];

    process.env.MLLD_DEBUG_GUARDS = '1';

    try {
      const envWithoutTag = createEnv();
      await evaluateDirective(
        parseSync('/guard @prep for secret = when [ * => allow ]')[0] as DirectiveNode,
        envWithoutTag
      );
      envWithoutTag.setVariable('secretVar', createSecretVariable('secretVar', 'value'));
      await evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, envWithoutTag);

      const envWithTag = createEnv();
      const withTagDirectives = parseSync(`
/exe @tagValue(timing, value, input) = js { return "parent-tag:" + timing + ":" + value; }
/guard @prep for secret = when [ * => allow ]
      `).filter(isDirectiveNode) as DirectiveNode[];
      for (const directive of withTagDirectives) {
        await evaluateDirective(directive, envWithTag);
      }
      envWithTag.setVariable('secretVar', createSecretVariable('secretVar', 'value'));
      await evaluateDirective(parseSync('/show @secretVar')[0] as DirectiveNode, envWithTag);
      capturedCalls = consoleSpy.mock.calls.map(call => [...call]);
    } finally {
      if (originalDebug === undefined) {
        delete process.env.MLLD_DEBUG_GUARDS;
      } else {
        process.env.MLLD_DEBUG_GUARDS = originalDebug;
      }
      consoleSpy.mockRestore();
    }

    const availabilityCalls = capturedCalls.filter(
      call => call[0] === '[guard-pre-hook] prefixWith availability'
    );
    expect(availabilityCalls.length).toBeGreaterThanOrEqual(2);

    const availabilityStates = availabilityCalls
      .map(call => call[1] as { envHasTag?: boolean; childHasTag?: boolean })
      .filter(Boolean);
    expect(availabilityStates.some(state => state.envHasTag === false && state.childHasTag === false)).toBe(true);
    expect(availabilityStates.some(state => state.envHasTag === true && state.childHasTag === true)).toBe(true);
  });

  it('attaches guard input helper members as non-enumerable properties', () => {
    const target = createSecretVariable('target', 'payload');
    const helper = createGuardInputHelper([createSecretVariable('a', 'one'), createSecretVariable('b', 'two')]);

    attachGuardHelper(target, helper);

    const keys = Object.keys(target as object);
    expect(keys).not.toContain('any');
    expect(keys).not.toContain('all');
    expect(keys).not.toContain('none');
    expect(keys).not.toContain('totalTokens');
    expect(keys).not.toContain('maxTokens');

    const anyDescriptor = Object.getOwnPropertyDescriptor(target as object, 'any');
    expect(anyDescriptor?.enumerable).toBe(false);
    expect(anyDescriptor?.configurable).toBe(true);
    expect(anyDescriptor?.writable).toBe(false);

    expect((target as any).any).toBe(helper.any);
    expect((target as any).all).toBe(helper.all);
    expect((target as any).none).toBe(helper.none);
    expect((target as any).totalTokens()).toBe(helper.totalTokens());
    expect((target as any).maxTokens()).toBe(helper.maxTokens());
  });
});
