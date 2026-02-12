import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigFile } from './ConfigFile';

describe('ConfigFile resolver prefixes', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-config-file-test-'));
    configPath = path.join(tempDir, 'mlld-config.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reads resolver prefixes from resolvers.prefixes', async () => {
    await fs.writeFile(configPath, JSON.stringify({
      resolvers: {
        prefixes: [
          {
            prefix: '@local/',
            resolver: 'LOCAL',
            config: { basePath: './llm/modules' }
          }
        ]
      }
    }, null, 2));

    const configFile = new ConfigFile(configPath);
    const prefixes = configFile.getResolverPrefixes();

    expect(prefixes).toHaveLength(1);
    expect(prefixes[0]?.prefix).toBe('@local/');
  });

  it('reads resolver prefixes from top-level resolverPrefixes', async () => {
    await fs.writeFile(configPath, JSON.stringify({
      resolverPrefixes: [
        {
          prefix: '@local/',
          resolver: 'LOCAL',
          config: { basePath: './llm/modules' }
        }
      ]
    }, null, 2));

    const configFile = new ConfigFile(configPath);
    const prefixes = configFile.getResolverPrefixes();

    expect(prefixes).toHaveLength(1);
    expect(prefixes[0]?.prefix).toBe('@local/');
  });

  it('writes resolver prefixes to resolvers.prefixes', async () => {
    await fs.writeFile(configPath, JSON.stringify({
      resolverPrefixes: [
        {
          prefix: '@local/',
          resolver: 'LOCAL',
          config: { basePath: './llm/modules' }
        }
      ]
    }, null, 2));

    const configFile = new ConfigFile(configPath);
    await configFile.setResolverPrefixes([
      {
        prefix: '@work/',
        resolver: 'LOCAL',
        config: { basePath: './work/modules' }
      }
    ]);

    const written = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<string, any>;

    expect(written.resolvers?.prefixes?.[0]?.prefix).toBe('@work/');
    expect(written.resolverPrefixes).toBeUndefined();
  });
});
