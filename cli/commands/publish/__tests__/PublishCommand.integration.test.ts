import { describe, expect, test } from 'vitest';
import { parseSync } from '@grammar/parser';
import { ModuleValidator } from '../validation/ModuleValidator';
import type { ModuleData, ModuleMetadata, ValidationContext } from '../types/PublishingTypes';

const BASE_METADATA: ModuleMetadata = {
  name: 'demo-module',
  author: 'tester',
  about: 'Test module',
  needs: [],
  license: 'CC0'
};

const DEFAULT_CONTEXT: ValidationContext = {
  user: { login: 'tester', id: 1 },
  octokit: {
    orgs: {
      // Treat organization lookups as not-a-member so tests stay deterministic.
      getMembershipForUser: async () => {
        throw { status: 404 };
      }
    }
  } as any,
  dryRun: true
};

function buildModule(content: string, metadataOverrides: Partial<ModuleMetadata> = {}): ModuleData {
  const metadata = { ...BASE_METADATA, ...metadataOverrides };
  return {
    metadata,
    content,
    filePath: 'module.mld',
    gitInfo: { isGitRepo: false },
    ast: parseSync(content)
  };
}

describe('ModuleValidator integration', () => {
  const validator = new ModuleValidator();

  test('fails when module lacks explicit export manifest', async () => {
    const moduleData = buildModule('/var @value = "hello"');

    const result = await validator.validate(moduleData, DEFAULT_CONTEXT);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.message.includes('Add `/export'))).toBe(true);
  });

  test('fails when export references undeclared binding', async () => {
    const content = `/export { helper }\n/var @value = "demo"`;
    const moduleData = buildModule(content);

    const result = await validator.validate(moduleData, DEFAULT_CONTEXT);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.message.includes("'helper'"))).toBe(true);
  });

  test('accepts module with declared exports', async () => {
    const content = `/export { value }\n/var @value = "demo"`;
    const moduleData = buildModule(content);

    const result = await validator.validate(moduleData, DEFAULT_CONTEXT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.exports?.map(binding => binding.name)).toEqual(['value']);
  });

  test('accepts exports declared inside mlld-run blocks', async () => {
    const content = [
      '```mlld-run',
      '/var @value = "demo"',
      '/export { @value }',
      '```'
    ].join('\n');
    const moduleData = buildModule(content);

    const result = await validator.validate(moduleData, DEFAULT_CONTEXT);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.exports?.map(binding => binding.name)).toEqual(['value']);
  });

  test('fails on unauthorized registry import', async () => {
    const content = `/export { value }\n/var @value = "demo"\n/import module { tool } from @other/module`;
    const moduleData = buildModule(content);

    const result = await validator.validate(moduleData, DEFAULT_CONTEXT);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.field === 'imports')).toBe(true);
    expect(result.imports?.[0]?.author).toBe('other');
  });

  test('warns when using local imports', async () => {
    const content = `/export { value }\n/var @value = "demo"\n/import local { helper } from @tester/dev-tools`;
    const moduleData = buildModule(content);

    const result = await validator.validate(moduleData, DEFAULT_CONTEXT);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(warning => warning.field === 'imports')).toBe(true);
    expect(result.imports?.[0]?.source).toBe('local');
  });
});
