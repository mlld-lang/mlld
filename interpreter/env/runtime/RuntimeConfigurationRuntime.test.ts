import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedURLConfig } from '@core/config/types';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { defaultStreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import { RuntimeConfigurationRuntime } from './RuntimeConfigurationRuntime';

describe('RuntimeConfigurationRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges URL options and applies URL config through cache manager', () => {
    const runtime = new RuntimeConfigurationRuntime();
    const merged = runtime.mergeUrlOptions(
      {
        allowedProtocols: ['http', 'https'],
        allowedDomains: [],
        blockedDomains: [],
        maxResponseSize: 10,
        timeout: 100
      },
      {
        timeout: 250
      }
    );
    const setURLConfig = vi.fn();
    const urlConfig = {
      enabled: true,
      allowPrivateIPs: false,
      cache: {
        enabled: true,
        defaultTTL: 60,
        rules: []
      },
      security: {
        allowedDomains: [],
        blockedDomains: [],
        allowedProtocols: ['https'],
        maxResponseSize: 1024,
        timeout: 1000,
        allowRedirects: true
      }
    } as unknown as ResolvedURLConfig;

    const applied = runtime.applyUrlConfig({ setURLConfig }, urlConfig);

    expect(merged.timeout).toBe(250);
    expect(merged.maxResponseSize).toBe(10);
    expect(applied).toBe(urlConfig);
    expect(setURLConfig).toHaveBeenCalledWith(urlConfig);
  });

  it('updates streaming options and publishes to sink when provided', () => {
    const runtime = new RuntimeConfigurationRuntime();
    const sink = { setStreamingOptions: vi.fn() };

    const merged = runtime.setStreamingOptions(
      defaultStreamingOptions,
      { enabled: false, format: 'json' },
      sink
    );
    const reset = runtime.setStreamingOptions(merged, undefined, sink);

    expect(merged.enabled).toBe(false);
    expect(merged.format).toBe('json');
    expect(sink.setStreamingOptions).toHaveBeenCalledWith(merged);
    expect(reset).toEqual(defaultStreamingOptions);
    expect(sink.setStreamingOptions).toHaveBeenCalledWith(defaultStreamingOptions);

    const streamingManager = runtime.ensureStreamingManager(undefined);
    expect(runtime.setStreamingManager(streamingManager)).toBe(streamingManager);
    expect(runtime.ensureStreamingManager(streamingManager)).toBe(streamingManager);
  });

  it('creates ephemeral registry/resolver managers when requested', async () => {
    const runtime = new RuntimeConfigurationRuntime();
    const result = await runtime.reconfigureForEphemeral({
      fileSystem: new MemoryFileSystem(),
      projectRoot: '/repo',
      hasRegistryManager: true,
      hasResolverManager: true
    });

    expect(result.registryManager).toBeDefined();
    expect(result.resolverManager).toBeDefined();
    expect(
      result.resolverManager?.getPrefixConfigs().some(config => config.prefix === '@base')
    ).toBe(true);
  });

  it('configures local modules with github user and allowed authors', async () => {
    const runtime = new RuntimeConfigurationRuntime();
    const configureLocalModules = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn().mockResolvedValue(true);
    const getGitHubUser = vi.fn().mockResolvedValue({ login: 'Alice' });
    vi.spyOn(GitHubAuthService, 'getInstance').mockReturnValue({
      getGitHubUser
    } as any);

    await runtime.configureLocalModules({
      resolverManager: { configureLocalModules } as any,
      localModulePath: '/repo/.mlld/modules',
      fileSystem: { exists } as any,
      projectConfig: {
        getResolverPrefixes: () => [
          { prefix: '@alice/', resolver: 'LOCAL' },
          { prefix: '@team/', resolver: 'HTTP' },
          { prefix: '@public/', resolver: 'REGISTRY' }
        ]
      } as any
    });

    expect(configureLocalModules).toHaveBeenCalledWith('/repo/.mlld/modules', {
      currentUser: 'alice',
      allowedAuthors: ['alice', 'team']
    });
  });
});
