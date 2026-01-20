import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyCommand } from './verify';
import { mockConsole } from '@tests/utils/cli/mockConsole';
import { mockProcessExit } from '@tests/utils/cli/mockProcessExit';

const mockVerify = vi.fn();

vi.mock('@core/security/SignatureStore', () => ({
  SignatureStore: vi.fn().mockImplementation(() => ({
    verify: mockVerify
  }))
}));

vi.mock('@services/fs/NodeFileSystem', () => ({
  NodeFileSystem: vi.fn().mockImplementation(() => ({}))
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
      hash: 'sha256:abc',
      method: 'sha256',
      signedat: '2024-01-01T00:00:00Z',
      signedby: 'alice',
      template: 'Evaluate @input',
      verified: true
    });

    const { mocks, restore } = mockConsole();

    try {
      await verifyCommand({ vars: ['prompt'] });

      expect(mockVerify).toHaveBeenCalledWith('prompt');
      expect(mocks.log).toHaveBeenCalledTimes(1);
      expect(mocks.log).toHaveBeenCalledWith(
        JSON.stringify(
          {
            hash: 'sha256:abc',
            method: 'sha256',
            signedat: '2024-01-01T00:00:00Z',
            signedby: 'alice',
            template: 'Evaluate @input',
            verified: true
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
      hash: 'sha256:abc',
      method: 'sha256',
      signedat: '2024-01-01T00:00:00Z',
      signedby: 'alice',
      template: 'Evaluate @input',
      verified: true
    });

    const { restore } = mockConsole();

    try {
      await verifyCommand({ vars: ['@prompt'] });
      expect(mockVerify).toHaveBeenCalledWith('prompt');
    } finally {
      restore();
    }
  });

  it('prints multiple results and sets exitCode for failures', async () => {
    mockVerify
      .mockResolvedValueOnce({
        hash: 'sha256:first',
        method: 'sha256',
        signedat: '2024-01-01T00:00:00Z',
        signedby: 'alice',
        template: 'First',
        verified: true
      })
      .mockResolvedValueOnce({
        hash: 'sha256:second',
        method: 'sha256',
        signedat: '2024-01-01T00:00:00Z',
        signedby: 'alice',
        template: 'Second',
        verified: false
      });

    const { mocks, restore } = mockConsole();

    try {
      process.env.MLLD_VERIFY_VARS = '@first, @second';
      await verifyCommand({});

      expect(mockVerify).toHaveBeenCalledWith('first');
      expect(mockVerify).toHaveBeenCalledWith('second');
      expect(mocks.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(mocks.log.mock.calls[0][0]);
      expect(logged).toEqual({
        first: {
          hash: 'sha256:first',
          method: 'sha256',
          signedat: '2024-01-01T00:00:00Z',
          signedby: 'alice',
          template: 'First',
          verified: true
        },
        second: {
          hash: 'sha256:second',
          method: 'sha256',
          signedat: '2024-01-01T00:00:00Z',
          signedby: 'alice',
          template: 'Second',
          verified: false
        }
      });
      expect(process.exitCode).toBe(1);
    } finally {
      restore();
    }
  });
});
