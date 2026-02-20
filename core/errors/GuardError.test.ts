import { describe, it, expect } from 'vitest';
import { GuardError } from './GuardError';

describe('GuardError', () => {
  it('formats deny messages with guard and operation context', () => {
    const error = new GuardError({
      decision: 'deny',
      guardName: '@secretProtection',
      guardFilter: 'data:secret',
      operation: {
        type: 'show'
      },
      reason: 'Secrets cannot be displayed'
    });

    expect(error.message).toContain('Guard blocked operation: Secrets cannot be displayed');
    expect(error.message).toContain('Guard: @secretProtection (for data:secret)');
    expect(error.message).toContain('Operation: /show');
    expect(error.reason).toBe('Secrets cannot be displayed');
  });

  it('formats retry failure messaging with hint details', () => {
    const error = new GuardError({
      decision: 'deny',
      guardName: '@jsonValidator',
      guardFilter: 'data:llmjson',
      operation: {
        type: 'run',
        subtype: 'js'
      },
      reason: 'Cannot retry: Invalid JSON from LLM (source not retryable)',
      retryHint: 'Invalid JSON from LLM'
    });

    expect(error.message).toContain('Guard retry failed: Cannot retry: Invalid JSON from LLM (source not retryable)');
    expect(error.message).toContain('Guard: @jsonValidator (for data:llmjson)');
    expect(error.message).toContain('Operation: /run (js)');
    expect(error.message).toContain('Hint: Invalid JSON from LLM');
  });

  it('formats retry requests when guard allows re-execution', () => {
    const error = new GuardError({
      decision: 'retry',
      guardFilter: 'data:pii',
      operation: {
        type: 'run',
        subtype: 'cmd'
      },
      retryHint: 'Mask sensitive data'
    });

    expect(error.message).toContain('Guard retry requested: Mask sensitive data');
    expect(error.message).toContain('Guard: data:pii');
    expect(error.message).toContain('Operation: /run (cmd)');
    expect(error.message).toContain('Hint: Mask sensitive data');
  });

  it('formats policy capability denials using structured MlldDenial format', () => {
    const error = new GuardError({
      decision: 'deny',
      guardName: '__policy_cmd_access',
      operation: {
        type: 'run',
        subtype: 'cmd',
        command: 'npm install'
      },
      reason: "Command 'npm' denied by policy",
      policyName: '@p',
      policyRule: 'capabilities.allow',
      policySuggestions: [
        "Add 'cmd:npm:*' to capabilities.allow",
        'Review active policies with @mx.policy.activePolicies'
      ]
    });

    expect(error.message).toContain('Operation denied');
    expect(error.message).toContain('Blocked by: Policy @p');
    expect(error.message).toContain('Rule: capabilities.allow');
    expect(error.message).toContain("Command 'npm' denied by policy");
    expect(error.message).toContain("Add 'cmd:npm:*' to capabilities.allow");
    expect(error.message).not.toContain('Guard blocked operation');
    expect(error.context.code).toBe('POLICY_CAPABILITY_DENIED');
    expect(error.context.blocker.type).toBe('policy');
  });

  it('falls back to guard format when policyName is not provided', () => {
    const error = new GuardError({
      decision: 'deny',
      guardName: '__policy_cmd_access',
      operation: {
        type: 'run',
        subtype: 'cmd',
        command: 'npm install'
      },
      reason: "Command 'npm' denied by policy"
    });

    expect(error.message).toContain('Guard blocked operation');
    expect(error.context.code).toBe('GUARD_DENIED');
    expect(error.context.blocker.type).toBe('guard');
  });
});
