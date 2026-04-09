import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { resolveAuthorizationSurfaceOperation } from './tool-metadata';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('resolveAuthorizationSurfaceOperation', () => {
  it('preserves inherited surface visibility for nested executables without runtime tool surfaces', () => {
    const env = createEnv();

    expect(resolveAuthorizationSurfaceOperation({
      env,
      operationName: 'writeOp',
      inheritedAuthorizationSurfaceOperation: true
    })).toBe(true);
  });

  it('keeps runtime tool-surface substrate calls hidden', () => {
    const env = createEnv();
    env.setScopedEnvironmentConfig({
      tools: {
        send_email: {
          mlld: '__toolbridge_fn_send_email_1'
        }
      }
    } as any);

    expect(resolveAuthorizationSurfaceOperation({
      env,
      operationName: '__toolbridge_fn_send_email_1',
      inheritedAuthorizationSurfaceOperation: true
    })).toBe(false);
    expect(resolveAuthorizationSurfaceOperation({
      env,
      operationName: 'send_email',
      inheritedAuthorizationSurfaceOperation: true
    })).toBe(true);
  });

  it('keeps llm executables off the visible surface even when nested', () => {
    const env = createEnv();

    expect(resolveAuthorizationSurfaceOperation({
      env,
      operationName: 'claude',
      executableLabels: ['llm'],
      inheritedAuthorizationSurfaceOperation: true
    })).toBe(false);
  });
});
