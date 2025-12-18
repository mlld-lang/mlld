import { describe, it, expect } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Guard Minimal Reproduction', () => {
  it('should show what guards actually receive', async () => {
    const script = `
/guard for secret = when [
  @mx.op.type == "exe" => deny "blocked secret"
  * => allow
]

/exe @renderSecret(key) = \`Secret: @key\`

/var secret @apiKey = "sk-live-123"
/show @renderSecret(@apiKey)
`;

    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, process.cwd());

    const hookManager = env.getHookManager();
    const originalRunPre = hookManager.runPre.bind(hookManager);
    hookManager.runPre = async (...args) => {
      console.error('\n========== GUARD PRE-HOOK CALLED ==========');
      console.error('Directive kind:', args[0]?.kind);
      console.error('Inputs array length:', Array.isArray(args[1]) ? args[1].length : 'N/A');
      console.error('Inputs array:', args[1]);

      if (Array.isArray(args[1])) {
        if (args[1].length > 0) {
          for (let i = 0; i < args[1].length; i += 1) {
            const input = args[1][i] as any;
            console.error(`\n--- Input[${i}] ---`);
            console.error('typeof:', typeof input);
            console.error('constructor:', input?.constructor?.name);
            console.error('isVariable (has .type):', Boolean(input?.type));
            console.error('.type:', input?.type);
            console.error('.name:', input?.name);
            console.error('.value:', input?.value);
            console.error('.mx:', safeStringify(input?.mx));
            console.error('.mx exists?:', input?.mx !== undefined);
            if (input?.mx) {
              console.error('.mx.labels:', input.mx.labels);
              console.error('.mx.taint:', input.mx.taint);
            }
          }
        } else {
          console.error('⚠️  INPUTS ARRAY IS EMPTY');
        }
      } else {
        console.error('⚠️  INPUTS ARRAY IS NOT PRESENT');
      }

      console.error('\nOperation context:', safeStringify(args[3]));
      console.error('Helpers:', (args as unknown[])[4]);
      console.error('==========================================\n');

      return originalRunPre(...args);
    };

    console.error('\n🔍 RUNNING TEST SCRIPT...\n');

    const parseResult = await parse(script);
    if (!parseResult.success) {
      console.error('❌ PARSE FAILED');
      console.error(parseResult.error);
      throw parseResult.error || new Error('Parse failed');
    }

    const ast = parseResult.ast;
    await expect(evaluate(ast, env)).rejects.toThrow(/blocked secret/);
    console.error('\n✅ TEST COMPLETE (Guard blocked secret as expected)\n');
  });
});

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[Unserializable: ${error instanceof Error ? error.message : String(error)}]`;
  }
}
