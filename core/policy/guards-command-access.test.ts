import { describe, it, expect } from 'vitest';
import { evaluateCommandAccess } from './guards';
import type { PolicyConfig } from './union';

describe('evaluateCommandAccess', () => {
  it('allows exact command matches without extra args', () => {
    const policy: PolicyConfig = {
      allow: ['cmd:git:status']
    };

    const allowed = evaluateCommandAccess(policy, 'git status');
    const denied = evaluateCommandAccess(policy, 'git status -s');

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  it('allows wildcard suffix patterns', () => {
    const policy: PolicyConfig = {
      allow: ['cmd:git:status:*']
    };

    const allowed = evaluateCommandAccess(policy, 'git status -s');
    const alsoAllowed = evaluateCommandAccess(policy, 'git status');

    expect(allowed.allowed).toBe(true);
    expect(alsoAllowed.allowed).toBe(true);
  });

  it('enforces allow list for unlisted commands', () => {
    const policy: PolicyConfig = {
      allow: ['cmd:git:*']
    };

    const denied = evaluateCommandAccess(policy, 'curl https://example.com');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain("Command 'curl' denied by policy");
  });

  it('denies matching commands before allow list', () => {
    const policy: PolicyConfig = {
      allow: ['cmd:npm:*'],
      deny: ['cmd:npm:install:*']
    };

    const denied = evaluateCommandAccess(policy, 'npm install express');
    expect(denied.allowed).toBe(false);
  });

});
