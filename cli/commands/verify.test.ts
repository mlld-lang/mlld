import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyCommand } from './verify';
import { mockConsole } from '@tests/utils/cli/mockConsole';
import { mockProcessExit } from '@tests/utils/cli/mockProcessExit';

const mockVerify = vi.fn();

vi.mock('@disreguard/sig', () => ({
  createSigContext: vi.fn().mockReturnValue({}),
  PersistentContentStore: vi.fn().mockImplementation(() => ({
    verify: mockVerify
  }))
}));

vi.mock('@core/security/sig-adapter', () => ({
  normalizeContentVerifyResult: vi.fn((result: any) => ({
    verified: Boolean(result?.verified),
    ...(typeof result?.content === 'string' ? { template: result.content } : {}),
    ...(result?.signature?.hash ? { hash: result.signature.hash } : {}),
    ...(result?.signature?.signedBy ? { signedBy: result.signature.signedBy } : {}),
    ...(result?.signature?.signedAt ? { signedAt: result.signature.signedAt } : {}),
    ...(result?.error ? { error: result.error } : {})
  }))
}));

vi.mock('../utils/command-context', () => ({
  getCommandContext: vi.fn().mockResolvedValue({ projectRoot: '/project' })
}));

describe('verifyCommand', () => {
  const originalEnv = process.env.MLLD_VERIFY_VARS;

  beforeEach(() => {
    mockVerify.mockReset();
    process.env.MLLD_VERIFY_VARS = '';
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.env.MLLD_VERIFY_VARS = originalEnv;
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it('exits when no variables are provided', async () => {
    const { mocks, restore } = mockConsole();
    const { mockExit, restore: restoreExit } = mockProcessExit();

    try {
      await expect(verifyCommand({})).rejects.toThrow('Process exited with code 1');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mocks.error).toHaveBeenCalledWith(
        'MLLD_VERIFY_VARS is not set and no variables are provided.'
      );
    } finally {
      restore();
      restoreExit();
    }
  });

  it('prints a single verification result', async () => {
    mockVerify.mockResolvedValue({
      id: 'prompt',
      verified: true,
      content: 'Evaluate @input',
      signature: {
        id: 'prompt',
        hash: 'sha256:abc',
        algorithm: 'sha256',
        signedBy: 'alice',
        signedAt: '2024-01-01T00:00:00Z',
        contentLength: 15
      }
    });

    const { mocks, restore } = mockConsole();

    try {
      await verifyCommand({ vars: ['prompt'] });

      expect(mockVerify).toHaveBeenCalledWith('prompt', { detail: 'cli:verify' });
      expect(mocks.log).toHaveBeenCalledTimes(1);
      expect(mocks.log).toHaveBeenCalledWith(
        JSON.stringify(
          {
            verified: true,
            template: 'Evaluate @input',
            hash: 'sha256:abc',
            signedBy: 'alice',
            signedAt: '2024-01-01T00:00:00Z'
          },
          null,
          2
        )
      );
      expect(process.exitCode).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('normalizes @ prefixes for cli args', async () => {
    mockVerify.mockResolvedValue({
      id: 'prompt',
      verified: true,
      content: 'Evaluate @input',
      signature: {
        id: 'prompt',
        hash: 'sha256:abc',
        algorithm: 'sha256',
        signedBy: 'alice',
        signedAt: '2024-01-01T00:00:00Z',
        contentLength: 15
      }
    });

    const { restore } = mockConsole();

    try {
      await verifyCommand({ vars: ['@prompt'] });
      expect(mockVerify).toHaveBeenCalledWith('prompt', { detail: 'cli:verify' });
    } finally {
      restore();
    }
  });

  it('prints multiple results and sets exitCode for failures', async () => {
    mockVerify
      .mockResolvedValueOnce({
        id: 'first',
        verified: true,
        content: 'First',
        signature: {
          id: 'first',
          hash: 'sha256:first',
          algorithm: 'sha256',
          signedBy: 'alice',
          signedAt: '2024-01-01T00:00:00Z',
          contentLength: 5
        }
      })
      .mockResolvedValueOnce({
        id: 'second',
        verified: false,
        error: 'No signature found for id'
      });

    const { mocks, restore } = mockConsole();

    try {
      process.env.MLLD_VERIFY_VARS = '@first, @second';
      await verifyCommand({});

      expect(mockVerify).toHaveBeenCalledWith('first', { detail: 'cli:verify' });
      expect(mockVerify).toHaveBeenCalledWith('second', { detail: 'cli:verify' });
      expect(mocks.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(mocks.log.mock.calls[0][0]);
      expect(logged).toEqual({
        first: {
          verified: true,
          template: 'First',
          hash: 'sha256:first',
          signedBy: 'alice',
          signedAt: '2024-01-01T00:00:00Z'
        },
        second: {
          verified: false,
          error: 'No signature found for id'
        }
      });
      expect(process.exitCode).toBe(1);
    } finally {
      restore();
    }
  });
});
