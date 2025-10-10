import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ImportTestRunner } from './test-utils';

/**
 * Issue: LOCAL resolver imports fail with "Import target is not a module"
 * even when the file contains valid mlld directives and exports.
 */
describe('LOCAL Resolver Import Tests (Bug Reproduction)', () => {
  let runner: ImportTestRunner;

  beforeEach(async () => {
    runner = new ImportTestRunner();
    await runner.setup();
  });

  afterEach(async () => {
    await runner.cleanup();
  });

  describe('Import .mld files via custom prefix', () => {
    it('should import .mld file with explicit extension via @context/ prefix', async () => {
      const result = await runner.runTest({
        name: 'local-resolver-mld-explicit-ext',
        description: 'Import .mld file with explicit extension using LOCAL resolver',
        debug: true,  // Enable debug output
        files: {
          'mlld-config.json': JSON.stringify({
            resolvers: {
              prefixes: [
                {
                  prefix: '@context/',
                  resolver: 'LOCAL',
                  config: {
                    basePath: './context'
                  }
                }
              ]
            }
          }, null, 2),
          'context/agents.mld': `
/var @agent_roster = [
  { "id": "party", "name": "Party", "discordId": "123" }
]

/exe @formatAgent(agent) = :::{{agent.name}}:::

/var @formatted = foreach @formatAgent(@agent_roster)

/export { @formatted, @agent_roster }
`
        },
        mainScript: `
/import @context/agents.mld as @agentsContext
/show @agentsContext.formatted`,
        expectedOutput: '["Party"]'
      });

      if (!result.success) {
        console.log('Test failed with error:', result.error);
        console.log('Exit code:', result.exitCode);
        console.log('Output:', result.output);
      }
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should import .mld file without extension via @context/ prefix (auto-detect)', async () => {
      const result = await runner.runTest({
        name: 'local-resolver-mld-no-ext',
        description: 'Import .mld file without extension - should auto-detect',
        files: {
          'mlld-config.json': JSON.stringify({
            resolvers: {
              prefixes: [
                {
                  prefix: '@context/',
                  resolver: 'LOCAL',
                  config: {
                    basePath: './context'
                  }
                }
              ]
            }
          }, null, 2),
          'context/agents.mld': `
/var @mention_prompt = "Available agents: Party"

/export { @mention_prompt }
`
        },
        mainScript: `
/import @context/agents as @agentsContext
/show @agentsContext.mention_prompt`,
        expectedOutput: 'Available agents: Party'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should import .mld.md file via @context/ prefix', async () => {
      const result = await runner.runTest({
        name: 'local-resolver-mld-md',
        description: 'Import .mld.md file using LOCAL resolver',
        files: {
          'mlld-config.json': JSON.stringify({
            resolvers: {
              prefixes: [
                {
                  prefix: '@shared/',
                  resolver: 'LOCAL',
                  config: {
                    basePath: './shared'
                  }
                }
              ]
            }
          }, null, 2),
          'shared/utils.mld.md': `
---
description: Shared utilities
---

/exe @capitalize(str) = js { return str.charAt(0).toUpperCase() + str.slice(1); }

/export { @capitalize }
`
        },
        mainScript: `
/import { @capitalize } from @shared/utils.mld.md
/var @result = @capitalize("hello")
/show @result`,
        expectedOutput: 'Hello'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

  });

  describe('Import type inference for LOCAL resolver', () => {
    it('should infer "local" import type for custom prefixes with LOCAL resolver', async () => {
      // This tests that the import type inference correctly identifies LOCAL resolver
      // imports and doesn't treat them as registry module imports
      const result = await runner.runTest({
        name: 'local-resolver-type-inference',
        description: 'LOCAL resolver should infer local/static import type',
        files: {
          'mlld-config.json': JSON.stringify({
            resolvers: {
              prefixes: [
                {
                  prefix: '@myprefix/',
                  resolver: 'LOCAL',
                  config: {
                    basePath: './modules'
                  }
                }
              ]
            }
          }, null, 2),
          'modules/config.mld': `
/var @setting = "value"

/export { @setting }
`
        },
        mainScript: `
/import { @setting } from @myprefix/config
/show @setting`,
        expectedOutput: 'value'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle .mld files without /export directive', async () => {
      // Auto-export should work for files without explicit /export
      const result = await runner.runTest({
        name: 'local-resolver-auto-export',
        description: 'LOCAL resolver should auto-export when no /export present',
        files: {
          'mlld-config.json': JSON.stringify({
            resolvers: {
              prefixes: [
                {
                  prefix: '@data/',
                  resolver: 'LOCAL',
                  config: {
                    basePath: './data'
                  }
                }
              ]
            }
          }, null, 2),
          'data/simple.mld': `
/var @value = "exported automatically"
`
        },
        mainScript: `
/import { @value } from @data/simple
/show @value`,
        expectedOutput: 'exported automatically'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('should handle nested directory structures', async () => {
      const result = await runner.runTest({
        name: 'local-resolver-nested',
        description: 'LOCAL resolver with nested directories',
        files: {
          'mlld-config.json': JSON.stringify({
            resolvers: {
              prefixes: [
                {
                  prefix: '@context/',
                  resolver: 'LOCAL',
                  config: {
                    basePath: './llm/context'
                  }
                }
              ]
            }
          }, null, 2),
          'llm/context/prompts/system.mld': `
/var @system_prompt = "You are a helpful assistant"

/export { @system_prompt }
`
        },
        mainScript: `
/import { @system_prompt } from @context/prompts/system
/show @system_prompt`,
        expectedOutput: 'You are a helpful assistant'
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
});
