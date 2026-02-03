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

  it('denies dangerous commands without allow.danger', () => {
    const policy: PolicyConfig = {
      allow: ['cmd:git:*']
    };

    const denied = evaluateCommandAccess(policy, 'git push origin --force');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('Dangerous capability requires allow.danger');
  });

  it('allows dangerous commands with allow.danger', () => {
    const policy: PolicyConfig = {
      allow: ['cmd:git:*'],
      capabilities: {
        danger: ['cmd:git:push:*:--force']
      }
    };

    const allowed = evaluateCommandAccess(policy, 'git push origin --force');
    expect(allowed.allowed).toBe(true);
  });

  describe('deny: ["sh"] blocks all shells and wrapper bypasses', () => {
    const policy: PolicyConfig = {
      deny: { sh: true }
    };

    it('blocks sh', () => {
      const result = evaluateCommandAccess(policy, 'sh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks bash', () => {
      const result = evaluateCommandAccess(policy, 'bash -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks zsh', () => {
      const result = evaluateCommandAccess(policy, 'zsh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks dash', () => {
      const result = evaluateCommandAccess(policy, 'dash -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks fish', () => {
      const result = evaluateCommandAccess(policy, 'fish -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks ksh', () => {
      const result = evaluateCommandAccess(policy, 'ksh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks /bin/sh (path prefix)', () => {
      const result = evaluateCommandAccess(policy, '/bin/sh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks /usr/bin/bash (path prefix)', () => {
      const result = evaluateCommandAccess(policy, '/usr/bin/bash -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks env sh (wrapper bypass)', () => {
      const result = evaluateCommandAccess(policy, 'env sh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks env bash (wrapper bypass)', () => {
      const result = evaluateCommandAccess(policy, 'env bash -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks nice sh (wrapper bypass)', () => {
      const result = evaluateCommandAccess(policy, 'nice sh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks env -u VAR sh (wrapper with flags)', () => {
      const result = evaluateCommandAccess(policy, 'env -u HOME sh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('blocks /usr/bin/env sh (wrapper with path prefix)', () => {
      const result = evaluateCommandAccess(policy, '/usr/bin/env sh -c "echo test"');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Shell access denied by policy');
    });

    it('allows git status (not a shell)', () => {
      const result = evaluateCommandAccess(policy, 'git status');
      expect(result.allowed).toBe(true);
    });

    it('allows grep sh file.txt (sh not in command position)', () => {
      const result = evaluateCommandAccess(policy, 'grep sh file.txt');
      expect(result.allowed).toBe(true);
    });
  });

});
